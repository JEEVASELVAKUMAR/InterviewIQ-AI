import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  Upload,
  FileCheck,
  Check,
  AlertCircle,
  ClipboardPaste,
  Briefcase,
  ChevronRight,
  ShieldAlert,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Card, LoadingSpinner } from '../components/ui';
import { createInterviewSession } from '../services/database';

export default function InterviewSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showPasteMode, setShowPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const [jobRole, setJobRole] = useState('');
  const [creating, setCreating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

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
    setRawText('');
    setSessionId(null);
    try {
      const text = await extractPdfText(f);
      if (!text || text.length < 50) {
        toast.error('Could not extract text from this PDF. It may be image-based.');
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

  const handleUsePastedText = () => {
    if (pastedText.trim().length < 20) {
      toast.error('Please paste at least a few lines of resume text.');
      return;
    }
    setRawText(pastedText.trim());
    setFile(null);
    setSessionId(null);
    toast.success('Resume text saved');
  };

  const handleCreateSession = async () => {
    if (!user) {
      toast.error('Please sign in to start an interview.');
      return;
    }
    if (!rawText) {
      toast.error('Please upload a resume or paste resume text first.');
      return;
    }
    setCreating(true);
    try {
      const session = await createInterviewSession(user.id, {
        resume_text: rawText,
        job_role: jobRole || null,
      });
      if (!session) throw new Error('Failed to create interview session.');
      setSessionId(session.id);
      toast.success('Interview session created!');
    } catch (err: any) {
      toast.error('Failed to create session: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="AI Video Interview — Setup"
        subtitle="Upload your resume and get ready for a live, conversational AI interview."
        icon={<Video className="h-5 w-5" />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Resume input */}
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">
            Resume Input
          </h3>

          {/* Upload zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-ink-200 dark:border-ink-700 hover:border-brand-400 hover:bg-brand-500/5'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
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
                <p className="text-sm font-medium text-ink-700 dark:text-ink-300">
                  Drop your PDF resume here or click to browse
                </p>
                <p className="mt-1 text-xs text-ink-400">PDF files only, max 5MB</p>
              </>
            )}
          </div>

          {parsing && <LoadingSpinner label="Extracting text from PDF..." />}

          {/* Paste mode toggle */}
          <button
            onClick={() => setShowPasteMode(!showPasteMode)}
            className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"
          >
            <ClipboardPaste className="h-4 w-4" />
            {showPasteMode ? 'Hide paste option' : 'Or paste resume text instead'}
          </button>

          <AnimatePresence>
            {showPasteMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste your resume text here..."
                  className="input mt-3 min-h-[120px] resize-y"
                />
                <button
                  onClick={handleUsePastedText}
                  className="btn-secondary mt-2 w-full"
                >
                  <Check className="h-4 w-4" /> Use This Text
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Extracted text confirmation */}
          {rawText && !parsing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-success-500" />
                <span className="text-sm font-medium text-success-600 dark:text-success-400">
                  Resume ready ({rawText.length} characters)
                </span>
              </div>
            </motion.div>
          )}
        </Card>

        {/* Job role + create session */}
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">
            Job Role & Session Setup
          </h3>

          <div className="mb-4">
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-300">
              <Briefcase className="h-4 w-4 text-ink-400" />
              Target Job Role (optional)
            </label>
            <input
              type="text"
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              placeholder="e.g. Frontend Developer, Data Analyst, DevOps Engineer..."
              className="input"
            />
            <p className="mt-1.5 text-xs text-ink-400">
              Providing a role helps the AI tailor questions more precisely.
            </p>
          </div>

          <button
            onClick={handleCreateSession}
            disabled={!rawText || creating || !!sessionId}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <Video className="h-4 w-4 animate-pulse" /> Creating Session...
              </>
            ) : sessionId ? (
              <>
                <Check className="h-4 w-4" /> Session Ready
              </>
            ) : (
              <>
                <Video className="h-4 w-4" /> Create Interview Session
              </>
            )}
          </button>

          {!rawText && !creating && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-ink-400" />
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Upload a resume or paste text first to create your interview session.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Ready to begin confirmation */}
      <AnimatePresence>
        {sessionId && !creating && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6"
          >
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Check className="h-5 w-5 text-success-500" />
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">
                  Ready to Begin
                </h3>
              </div>

              <p className="mb-5 text-sm text-ink-600 dark:text-ink-300">
                Your interview session is set up. Questions will be generated dynamically during the interview — you won't see them in advance, just like a real interview. Click below when you're ready to start.
              </p>

              {/* Proctoring warnings */}
              <div className="mb-5 space-y-3">
                <div className="flex items-start gap-3 rounded-xl bg-danger-500/10 p-4">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger-500" />
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                      Fullscreen required the entire time
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      This interview must stay in fullscreen the entire time. Exiting fullscreen or switching tabs will end the interview immediately and you'll need to restart.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-warning-500/10 p-4">
                  <Eye className="mt-0.5 h-5 w-5 shrink-0 text-warning-500" />
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                      Camera and microphone must stay on
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      Your camera and microphone must remain active throughout. Disabling either one will end the interview.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-500 dark:text-ink-400">
                  Make sure you're in a quiet, well-lit space before starting.
                </p>
                <button
                  onClick={() => navigate(`/interview/session/${sessionId}`)}
                  className="btn-primary shrink-0"
                >
                  Start Video Interview
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
