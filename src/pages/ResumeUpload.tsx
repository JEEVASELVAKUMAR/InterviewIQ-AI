import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Upload, Check, FileCheck, Sparkles, AlertCircle, Gauge, ChevronDown, ChevronUp, ArrowRight, Download, Building2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { saveResume, getResumeAnalysis, saveResumeAnalysis, createNotification } from '../services/database';
import { analyzeResume, parseResume, rewriteResumeForCompany } from '../services/ai';
import { PageHeader, Card, LoadingSpinner, Badge } from '../components/ui';
import type { Resume, ResumeAnalysis, RewrittenResume } from '../types';
import jsPDF from 'jspdf';

const targetCompanies = [
  '', 'Google', 'Amazon', 'Microsoft', 'Meta', 'Apple', 'Netflix', 'Uber', 'Adobe',
  'Atlassian', 'Salesforce', 'Oracle', 'Infosys', 'TCS', 'Accenture',
  'Capgemini', 'Wipro', 'Cognizant', 'Zoho', 'Freshworks',
];

export default function ResumeUpload() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [parsed, setParsed] = useState<Resume | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Company rewrite state
  const [targetCompany, setTargetCompany] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewrite, setRewrite] = useState<RewrittenResume | null>(null);

  const extractPdfText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text.trim();
  };

  const handleFile = async (f: File) => {
    if (f.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }
    setFile(f);
    setParsing(true);
    setParsed(null);
    setAnalysis(null);
    setRewrite(null);
    try {
      const text = await extractPdfText(f);
      if (!text || text.length < 50) {
        toast.error('Could not extract text from this PDF. It may be image-based.');
        setRawText('');
        return;
      }
      setRawText(text);
      toast.success('Resume text extracted');
    } catch (err: any) {
      toast.error('Failed to parse PDF: ' + err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!user || !rawText) return;
    setAnalyzing(true);
    setRewrite(null);
    try {
      const parseResult = await parseResume({ resumeText: rawText });
      const resumeData = {
        file_name: file?.name ?? 'resume.pdf',
        raw_text: rawText,
        skills: parseResult.skills ?? [],
        projects: parseResult.projects ?? [],
        education: parseResult.education ?? [],
        experience: parseResult.experience ?? [],
        certifications: parseResult.certifications ?? [],
      };
      const saved = await saveResume(user.id, resumeData);
      setParsed(saved);

      if (saved) {
        const cached = await getResumeAnalysis(saved.id);
        if (cached) {
          setAnalysis(cached);
          toast.success('Loaded cached resume analysis!');
          setAnalyzing(false);
          return;
        }
      }

      const analysisResult = await analyzeResume({
        resumeText: rawText,
        targetCompany: targetCompany || undefined,
      });
      const analysisData = {
        resume_id: saved!.id,
        ats_score: analysisResult.atsScore,
        summary_feedback: analysisResult.summaryFeedback,
        section_feedback: analysisResult.sectionFeedback,
        missing_sections: analysisResult.missingSections ?? [],
        keyword_gaps: analysisResult.keywordGaps ?? [],
        rewrite_suggestions: analysisResult.rewriteSuggestions ?? [],
      };
      const savedAnalysis = await saveResumeAnalysis(user.id, analysisData);
      setAnalysis(savedAnalysis);

      await createNotification(user.id, {
        title: 'Resume Analysis Complete',
        message: `Your ATS score is ${analysisResult.atsScore}/100. Check out the detailed feedback!`,
        type: 'system',
      });

      toast.success('Resume analyzed and saved!');
    } catch (err: any) {
      toast.error('Analysis failed: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Re-run rewrite whenever the target company changes (after analysis is available)
  useEffect(() => {
    if (!analysis || !rawText || !targetCompany) {
      setRewrite(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setRewriting(true);
      try {
        const res = await rewriteResumeForCompany({ resumeText: rawText, targetCompany });
        if (!cancelled) setRewrite(res);
      } catch (err: any) {
        if (!cancelled) toast.error('Rewrite failed: ' + err.message);
      } finally {
        if (!cancelled) setRewriting(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [targetCompany, analysis, rawText]);

  const downloadRewrittenPdf = () => {
    if (!rewrite?.rewrittenResume) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (lineHeight: number) => {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
    };

    // Header — name placeholder + target company
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Professional Resume', margin, y);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Optimized for ${targetCompany}`, margin, y);
    y += 20;
    doc.setTextColor(0);

    // Summary
    if (rewrite.rewrittenResume.summary) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      ensureSpace(20);
      doc.text('Summary', margin, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(rewrite.rewrittenResume.summary, maxWidth);
      for (const line of summaryLines) {
        ensureSpace(14);
        doc.text(line, margin, y);
        y += 14;
      }
      y += 8;
    }

    // Skills
    if (rewrite.rewrittenResume.skills?.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      ensureSpace(20);
      doc.text('Skills', margin, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const skillsText = rewrite.rewrittenResume.skills.join(' • ');
      const skillLines = doc.splitTextToSize(skillsText, maxWidth);
      for (const line of skillLines) {
        ensureSpace(14);
        doc.text(line, margin, y);
        y += 14;
      }
      y += 8;
    }

    // Sections
    for (const section of rewrite.rewrittenResume.sections ?? []) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      ensureSpace(20);
      doc.text(section.title, margin, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      for (const item of section.items ?? []) {
        const lines = doc.splitTextToSize(`• ${item}`, maxWidth);
        for (const line of lines) {
          ensureSpace(14);
          doc.text(line, margin, y);
          y += 14;
        }
      }
      y += 8;
    }

    doc.save(`resume-optimized-${targetCompany.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    toast.success('Downloaded optimized resume PDF');
  };

  const atsColor = analysis
    ? analysis.ats_score! >= 75
      ? 'text-success-500'
      : analysis.ats_score! >= 50
        ? 'text-warning-500'
        : 'text-danger-500'
    : '';

  const atsBg = analysis
    ? analysis.ats_score! >= 75
      ? 'bg-success-500/10'
      : analysis.ats_score! >= 50
        ? 'bg-warning-500/10'
        : 'bg-danger-500/10'
    : '';

  const sectionKeys = ['summary', 'skills', 'experience', 'projects', 'education'] as const;

  return (
    <div>
      <PageHeader
        title="Resume Upload & Analyzer"
        subtitle="Upload your PDF resume for AI extraction, ATS scoring, and company-specific rewriting."
        icon={<FileText className="h-5 w-5" />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload zone */}
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Upload Resume</h3>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-ink-200 dark:border-ink-700 hover:border-brand-400 hover:bg-brand-500/5'
            }`}
          >
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {file ? (
              <>
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-500/10 text-success-500">
                  <FileCheck className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-ink-900 dark:text-white">{file.name}</p>
                <p className="mt-1 text-xs text-ink-400">{(file.size / 1024).toFixed(1)} KB</p>
              </>
            ) : (
              <>
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800 text-ink-400">
                  <Upload className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium text-ink-700 dark:text-ink-300">Drop your PDF here or click to browse</p>
                <p className="mt-1 text-xs text-ink-400">PDF files only, max 5MB</p>
              </>
            )}
          </div>

          {parsing && <LoadingSpinner label="Extracting text from PDF..." />}

          {rawText && !parsing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-success-500" />
                <span className="text-sm font-medium text-success-600 dark:text-success-400">
                  Text extracted ({rawText.length} characters)
                </span>
              </div>
              <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary w-full">
                {analyzing ? (
                  <><Sparkles className="h-4 w-4 animate-pulse" /> Analyzing with AI...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Analyze with AI</>
                )}
              </button>
            </motion.div>
          )}
        </Card>

        {/* Extracted text — collapsed by default */}
        <Card>
          {rawText ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-success-500" />
                <span className="text-sm font-medium text-success-600 dark:text-success-400">
                  Text extracted ({rawText.length} characters)
                </span>
              </div>
              <button
                onClick={() => setShowRawText((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-ink-200 dark:border-ink-700 px-4 py-2.5 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
              >
                <span className="text-sm font-medium text-ink-600 dark:text-ink-300">
                  {showRawText ? 'Hide extracted text' : 'View extracted text'}
                </span>
                {showRawText ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
              </button>
              <AnimatePresence>
                {showRawText && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 max-h-80 overflow-y-auto rounded-xl bg-ink-50 dark:bg-ink-900/50 p-4">
                      <pre className="whitespace-pre-wrap text-xs text-ink-600 dark:text-ink-300">{rawText}</pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center text-center text-sm text-ink-400">
              <div>
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-ink-300" />
                Upload a PDF to begin
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ATS Analysis Results */}
      {analyzing && (
        <Card className="mt-6">
          <LoadingSpinner label="AI is analyzing your resume for ATS compatibility..." />
        </Card>
      )}

      <AnimatePresence>
        {analysis && !analyzing && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
            {/* ATS Score */}
            <Card className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <div className={`flex h-24 w-24 items-center justify-center rounded-2xl ${atsBg}`}>
                <div className="flex flex-col items-center">
                  <Gauge className={`h-6 w-6 ${atsColor}`} />
                  <span className={`font-display text-3xl font-bold ${atsColor}`}>{analysis.ats_score}</span>
                  <span className="text-xs text-ink-400">/ 100</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">ATS Score</h3>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{analysis.summary_feedback}</p>
              </div>
            </Card>

            {/* Company rewrite */}
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand-500" />
                <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">Optimize for a Company</h3>
              </div>
              <p className="mb-3 text-sm text-ink-500 dark:text-ink-400">
                Select a target company to rewrite your resume for that company's specific requirements. The AI rephrases your existing content to legitimately raise the ATS score.
              </p>
              <select
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                className="input mb-4"
              >
                {targetCompanies.map((c) => (
                  <option key={c} value={c}>{c || '— Select a company —'}</option>
                ))}
              </select>

              {rewriting && (
                <LoadingSpinner label={`Rewriting resume for ${targetCompany}...`} />
              )}

              {rewrite && !rewriting && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4 rounded-xl bg-brand-500/10 p-4">
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-ink-500">Before</span>
                      <span className={`font-display text-2xl font-bold ${atsColor}`}>{analysis.ats_score}</span>
                    </div>
                    <ArrowRight className="h-5 w-5 text-brand-500" />
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-ink-500">After</span>
                      <span className="font-display text-2xl font-bold text-success-500">{rewrite.rewrittenAtsScore}</span>
                    </div>
                    <div className="ml-auto">
                      <button onClick={downloadRewrittenPdf} className="btn-primary">
                        <Download className="h-4 w-4" /> Download Updated Resume
                      </button>
                    </div>
                  </div>

                  {rewrite.rewrittenResume.summary && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-ink-500">Summary</p>
                      <p className="text-sm text-ink-700 dark:text-ink-200">{rewrite.rewrittenResume.summary}</p>
                    </div>
                  )}

                  {rewrite.rewrittenResume.skills?.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-ink-500">Skills</p>
                      <div className="flex flex-wrap gap-2">
                        {rewrite.rewrittenResume.skills.map((s) => <Badge key={s} color="brand">{s}</Badge>)}
                      </div>
                    </div>
                  )}

                  {rewrite.rewrittenResume.sections?.map((sec, i) => (
                    <div key={i}>
                      <p className="mb-1 text-xs font-medium text-ink-500">{sec.title}</p>
                      <ul className="space-y-1 text-sm text-ink-700 dark:text-ink-200">
                        {sec.items.map((item, j) => <li key={j} className="flex gap-2"><span className="text-brand-500">•</span> {item}</li>)}
                      </ul>
                    </div>
                  ))}

                  {rewrite.changesSummary && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-ink-500">Key changes made</p>
                      <pre className="whitespace-pre-wrap rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3 text-xs text-ink-600 dark:text-ink-300">{rewrite.changesSummary}</pre>
                    </div>
                  )}
                </motion.div>
              )}
            </Card>

            {/* Missing sections */}
            {analysis.missing_sections.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-warning-500" />
                  <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">Missing Sections</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.missing_sections.map((s) => (
                    <Badge key={s} color="warning">{s}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Keyword gaps */}
            {analysis.keyword_gaps.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-danger-500" />
                  <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">Keyword Gaps</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.keyword_gaps.map((k) => (
                    <Badge key={k} color="danger">{k}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {/* Section feedback */}
            <Card>
              <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Section Feedback</h3>
              <div className="space-y-2">
                {sectionKeys.map((key) => {
                  const feedback = (analysis.section_feedback as any)?.[key];
                  if (!feedback) return null;
                  const isOpen = expandedSection === key;
                  return (
                    <div key={key} className="rounded-xl border border-ink-200 dark:border-ink-700 overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(isOpen ? null : key)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
                      >
                        <span className="text-sm font-medium capitalize text-ink-900 dark:text-white">{key}</span>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <p className="px-4 pb-3 text-sm text-ink-600 dark:text-ink-300">{feedback}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Rewrite suggestions */}
            {analysis.rewrite_suggestions.length > 0 && (
              <Card>
                <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Rewrite Suggestions</h3>
                <div className="space-y-3">
                  {analysis.rewrite_suggestions.map((s, i) => (
                    <div key={i} className="rounded-xl border border-ink-200 dark:border-ink-700 overflow-hidden">
                      <div className="grid grid-cols-1 gap-px bg-ink-200 dark:bg-ink-700 sm:grid-cols-2">
                        <div className="bg-danger-500/5 p-3">
                          <p className="mb-1 text-xs font-medium text-danger-500">Original</p>
                          <p className="text-sm text-ink-600 dark:text-ink-300">{s.original}</p>
                        </div>
                        <div className="bg-success-500/5 p-3">
                          <p className="mb-1 text-xs font-medium text-success-500">Improved</p>
                          <p className="text-sm text-ink-600 dark:text-ink-300">{s.improved}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parsed resume data */}
      {parsed && !analysis && !analyzing && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink-900 dark:text-white">AI-Parsed Resume</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h4 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Skills</h4>
              <div className="flex flex-wrap gap-2">
                {parsed.skills.length > 0 ? (
                  parsed.skills.map((s) => <Badge key={s} color="brand">{s}</Badge>)
                ) : (
                  <p className="text-sm text-ink-400">No skills detected</p>
                )}
              </div>
            </Card>
            <Card>
              <h4 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Projects</h4>
              {parsed.projects.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-ink-600 dark:text-ink-300">
                  {parsed.projects.map((p: any, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand-500">•</span> {p.name || p.title || JSON.stringify(p).slice(0, 80)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-400">No projects detected</p>
              )}
            </Card>
            <Card>
              <h4 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Education</h4>
              {parsed.education.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-ink-600 dark:text-ink-300">
                  {parsed.education.map((e: any, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand-500">•</span> {e.degree || e.institution || JSON.stringify(e).slice(0, 80)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-400">No education detected</p>
              )}
            </Card>
            <Card>
              <h4 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Experience</h4>
              {parsed.experience.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-ink-600 dark:text-ink-300">
                  {parsed.experience.map((e: any, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand-500">•</span> {e.role || e.company || JSON.stringify(e).slice(0, 80)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-400">No experience detected</p>
              )}
            </Card>
          </div>
        </motion.div>
      )}
    </div>
  );
}
