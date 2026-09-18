import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Send, User, Sparkles, Trash2, Loader2, Square, RotateCcw, Copy, Check, Search, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getChatHistory, saveChatMessage, getLatestResume } from '../services/database';
import { chatWithAIStream } from '../services/ai';
import { PageHeader, Card } from '../components/ui';
import type { ChatMessage, Resume } from '../types';

const suggestions = [
  'How do I answer "Tell me about yourself"?',
  'What are common system design interview questions?',
  'Explain the difference between SQL and NoSQL databases',
  'How should I prepare for a behavioral interview at Google?',
];

// Lightweight markdown renderer — supports headings, bold, inline code,
// fenced code blocks, and unordered/ordered lists. No external deps.
function renderMarkdown(text: string): { type: 'code' | 'text'; content: string; lang?: string }[] {
  const blocks: { type: 'code' | 'text'; content: string; lang?: string }[] = [];
  const lines = text.split('\n');
  let i = 0;
  let textBuf: string[] = [];
  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ type: 'text', content: textBuf.join('\n') });
      textBuf = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```(\w+)?\s*$/);
    if (fence) {
      flushText();
      const lang = fence[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code', content: codeLines.join('\n'), lang });
      continue;
    }
    textBuf.push(line);
    i++;
  }
  flushText();
  return blocks;
}

function MarkdownText({ content }: { content: string }) {
  // Render inline markdown: bold **x**, inline `code`, and basic headings/lists
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (/^#{1,3}\s+/.test(line)) {
          const level = line.match(/^(#{1,3})/)?.[1].length ?? 1;
          const text = line.replace(/^#{1,3}\s+/, '');
          const sizeClass = level === 1 ? 'text-base font-semibold' : level === 2 ? 'text-sm font-semibold' : 'text-sm font-medium';
          return <p key={i} className={`${sizeClass} text-ink-900 dark:text-white mt-2 first:mt-0`}>{renderInline(text)}</p>;
        }
        if (/^\s*[-*]\s+/.test(line)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-brand-500 mt-0.5">•</span>
              <span>{renderInline(line.replace(/^\s*[-*]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          const num = line.match(/^\s*(\d+)\./)?.[1] ?? '';
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-brand-500 font-mono text-xs mt-0.5">{num}.</span>
              <span>{renderInline(line.replace(/^\s*\d+\.\s+/, ''))}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        return <p key={i} className="leading-relaxed">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** and `code` patterns
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold text-ink-900 dark:text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++} className="rounded bg-ink-100 dark:bg-ink-900 px-1 py-0.5 font-mono text-xs text-brand-600 dark:text-brand-400">{token.slice(1, -1)}</code>);
    }
    lastIdx = match.index + token.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function CodeBlock({ content, lang }: { content: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative my-2 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-200 dark:border-ink-700 px-3 py-1.5">
        <span className="text-xs font-mono text-ink-400">{lang || 'code'}</span>
        <button onClick={copy} className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition">
          {copied ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed"><code className="font-mono text-ink-700 dark:text-ink-200">{content}</code></pre>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const blocks = renderMarkdown(content);
  return (
    <div className="text-sm text-ink-700 dark:text-ink-200">
      {blocks.map((b, i) => b.type === 'code'
        ? <CodeBlock key={i} content={b.content} lang={b.lang} />
        : <MarkdownText key={i} content={b.content} />
      )}
    </div>
  );
}

export default function ChatAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getChatHistory(user.id), getLatestResume(user.id)])
      .then(([msgs, r]) => {
        setMessages(msgs);
        setResume(r);
      })
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const userMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      user_id: user!.id,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setSending(true);
    setStreamingContent('');

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const stream = chatWithAIStream({
        message: content,
        history,
        resumeText: resume?.raw_text ?? undefined,
      });
      for await (const chunk of stream) {
        if (controller.signal.aborted) break;
        full += chunk;
        setStreamingContent(full);
      }
      const aiMsg: ChatMessage = {
        id: 'ai-' + Date.now(),
        user_id: user!.id,
        role: 'assistant',
        content: full || 'Sorry, I could not generate a response.',
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, aiMsg]);
      setStreamingContent('');

      if (user) {
        await saveChatMessage(user.id, 'user', content);
        await saveChatMessage(user.id, 'assistant', aiMsg.content);
      }
    } catch (err: any) {
      if (full) {
        // Save partial content even if interrupted
        const aiMsg: ChatMessage = {
          id: 'ai-' + Date.now(),
          user_id: user!.id,
          role: 'assistant',
          content: full,
          created_at: new Date().toISOString(),
        };
        setMessages((m) => [...m, aiMsg]);
        if (user) await saveChatMessage(user.id, 'assistant', full);
      } else {
        toast.error('Chat failed: ' + err.message);
      }
    } finally {
      setSending(false);
      setStreamingContent('');
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRegenerate = async () => {
    // Find last user message, remove last assistant message, re-send
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((m) => m.slice(0, m.findIndex((x) => x.id === lastUser.id) + 1));
    await handleSend(lastUser.content);
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const clearChat = () => {
    setMessages([]);
    toast.success('Chat cleared (history remains in database)');
  };

  const filteredMessages = search.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(search.toLowerCase()))
    : messages;

  return (
    <div>
      <PageHeader
        title="AI Chat Assistant"
        subtitle="Your context-aware career coach. Ask about interviews, coding, or career advice."
        icon={<Bot className="h-5 w-5" />}
      />

      <Card className="flex h-[calc(100vh-220px)] min-h-[500px] flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-200 dark:border-ink-700 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">InterviewIQ Assistant</p>
              <p className="text-xs text-success-500">● Online</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chat..."
                className="w-40 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 py-1.5 pl-7 pr-2 text-xs text-ink-700 dark:text-ink-200 focus:border-brand-400 focus:outline-none"
              />
            </div>
            {messages.length > 0 && (
              <button onClick={clearChat} className="btn-ghost p-2" aria-label="Clear chat">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            </div>
          ) : filteredMessages.length === 0 && !streamingContent ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
                <Bot className="h-8 w-8" />
              </div>
              <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">
                How can I help you prepare?
              </h3>
              <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">
                Ask me about interview questions, coding problems, career advice, or your resume.
              </p>
              <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-xl border border-ink-200 dark:border-ink-700 p-3 text-left text-sm text-ink-600 dark:text-ink-300 transition hover:border-brand-400 hover:bg-brand-500/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {filteredMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`group max-w-[75%] rounded-2xl p-3.5 ${
                      msg.role === 'user'
                        ? 'rounded-tr-none bg-brand-500 text-white'
                        : 'rounded-tl-none bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200'
                    }`}
                  >
                    {msg.role === 'assistant' ? <MessageContent content={msg.content} /> : <p className="whitespace-pre-wrap text-sm">{msg.content}</p>}
                    {msg.role === 'assistant' && (
                      <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="rounded-md p-1 text-ink-400 hover:bg-ink-200 dark:hover:bg-ink-700 hover:text-ink-700 dark:hover:text-ink-200"
                          aria-label="Copy"
                        >
                          {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 dark:bg-ink-700 text-ink-500">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </motion.div>
              ))}
              {/* Streaming in-progress message */}
              {streamingContent && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="max-w-[75%] rounded-2xl rounded-tl-none bg-ink-100 dark:bg-ink-800 p-3.5">
                    <MessageContent content={streamingContent} />
                    <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-brand-500 align-middle" />
                  </div>
                </div>
              )}
              {sending && !streamingContent && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-ink-100 dark:bg-ink-800 p-3.5">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-ink-200 dark:border-ink-700 p-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything about interviews, coding, or career..."
              rows={1}
              className="input resize-none flex-1"
              disabled={sending}
            />
            {sending ? (
              <button onClick={handleStop} className="btn-outline border-danger-500 text-danger-500 hover:bg-danger-500/10 shrink-0">
                <Square className="h-4 w-4" /> Stop
              </button>
            ) : (
              <>
                {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                  <button onClick={handleRegenerate} className="btn-outline shrink-0" aria-label="Regenerate">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => handleSend()} disabled={sending || !input.trim()} className="btn-primary shrink-0">
                  <Send className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
