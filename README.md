# InterviewIQ AI

An AI-powered placement preparation platform that combines mock interviews, resume analysis, skill gap analysis, coding evaluation, personalized roadmaps, and interview analytics — all grounded in your real resume data via RAG.

## Project Overview

InterviewIQ AI helps candidates prepare for technical and behavioral interviews at top companies. Upload your resume, and the platform uses AI to personalize every feature: generate mock interview questions, evaluate your answers, analyze skill gaps against dream companies, evaluate code submissions, build learning roadmaps, and track your progress with rich analytics.

👉 Try the Live Application : https://interviewiq-ai-platf-btna.bolt.host


## Architecture

```
React Frontend (Vite + TypeScript + Tailwind)
        │
        ├── Supabase Auth (email/password, JWT sessions)
        ├── Supabase Postgres (profiles, resumes, interviews, coding, roadmaps, chat, analytics)
        │         └── Row Level Security (owner-scoped CRUD per table)
        │
        └── Supabase Edge Functions (Deno)
                ├── ai-resume-parse   → Gemini (JSON) → Groq fallback
                ├── ai-skill-gap      → Gemini (JSON) → Groq fallback
                ├── ai-interview      → Gemini (JSON) → Groq fallback
                ├── ai-coding         → Gemini (JSON) → Groq fallback
                ├── ai-roadmap        → Gemini (JSON) → Groq fallback
                └── ai-chat           → Gemini (text) → Groq fallback
```

**Flow:** React Frontend → Supabase Auth → Edge Functions → Gemini API (primary) → Groq API (fallback) → Supabase Postgres → Analytics Dashboard

## Features

| Feature | Description |
|---------|-------------|
| **Authentication** | Email/password signup, login, password reset, JWT sessions, protected routes |
| **Dashboard** | Overall/coding/communication/technical/behavioral scores, skill radar, interview trend, quick actions |
| **Resume Upload** | PDF text extraction (client-side via pdfjs), AI parsing of skills/projects/education/experience/certifications |
| **Skill Gap Analysis** | Compare resume against dream company + role, get missing skills, strengths, weaknesses, prioritized learning path |
| **AI Mock Interview** | Configurable difficulty/type/count, chain-prompting flow, per-answer evaluation with scores + feedback, transcript saved |
| **Coding Evaluation** | Java/Python/C++/JavaScript, AI evaluates correctness, time/space complexity, style, bugs, edge cases, improvements |
| **Personalized Roadmap** | 30/60/90-day plans with daily tasks, weekly goals, mini projects, mock interviews, curated resources |
| **Interview Analytics** | Radar chart, score trends, interview type breakdown, weak-skill heatmap |
| **AI Chat Assistant** | Context-aware career coach using resume context (RAG-style), persistent chat history |
| **Dark Mode** | Full dark/light theme toggle with system preference detection |
| **Responsive** | Mobile-friendly sidebar, responsive grids, touch-friendly controls |

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, React Router, Framer Motion, Recharts, Lucide React, react-hot-toast
- **Backend:** Supabase Edge Functions (Deno runtime)
- **Database:** Supabase Postgres with Row Level Security
- **AI:** Google Gemini (primary), Groq (automatic fallback with exponential backoff)
- **Auth:** Supabase Auth (email/password, JWT)

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd InterviewIQ-AI

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app runs at `http://localhost:5173`.

### Environment Variables

The following are pre-configured in `.env` (Supabase project is provisioned):

```env
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

To enable AI features, set these as **Edge Function secrets** in the Supabase dashboard:

```
GEMINI_API_KEY=<your-gemini-api-key>
GROQ_API_KEY=<your-groq-api-key>
```

> Without AI keys, the app still works — edge functions return graceful fallback responses so the UI is fully functional.

## API Documentation

All AI endpoints are Supabase Edge Functions called via `POST` with JSON body. Authentication uses the Supabase JWT bearer token.

| Endpoint | Body | Returns |
|----------|------|---------|
| `ai-resume-parse` | `{ resumeText }` | `{ skills, projects, education, experience, certifications }` |
| `ai-skill-gap` | `{ resumeText, dreamCompany, role }` | `{ score, missingSkills, strengths, weaknesses, roadmap }` |
| `ai-interview` (generate) | `{ action: "generate", difficulty, type, count, resumeText? }` | `{ questions: [] }` |
| `ai-interview` (evaluate) | `{ action: "evaluate", question, answer, type, difficulty, turnIndex }` | `{ evaluation: { scores, feedback }, followUp }` |
| `ai-coding` | `{ language, problem, code }` | `{ correctness, timeComplexity, spaceComplexity, optimization, codeStyle, edgeCases, bugs, finalScore, improvements }` |
| `ai-roadmap` | `{ resumeText?, interviewHistory?, codingScore?, skillGap?, duration? }` | `{ duration, phases: [] }` |
| `ai-chat` | `{ message, history, resumeText? }` | `{ response }` |

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | User info: name, college, branch, year, skills |
| `resumes` | Extracted resume text, parsed skills/projects/education/experience |
| `interviews` | Mock interview sessions: config, transcript, scores, feedback |
| `coding_evaluations` | Code submissions with AI evaluation results |
| `roadmaps` | Personalized 30/60/90-day learning plans |
| `chat_history` | AI chat assistant conversation turns |
| `analytics` | Periodic analytics snapshots per user |

All tables have RLS enabled with owner-scoped CRUD policies (`auth.uid() = user_id`).

## Folder Structure

```
src/
├── components/       # Reusable UI: AppLayout, Sidebar, Navbar, ui primitives
├── context/          # AuthContext, ThemeContext
├── lib/              # Supabase client
├── pages/            # 13 pages: Landing, Login, Signup, ForgotPassword, Dashboard, ResumeUpload, SkillGap, MockInterview, CodingEval, Roadmap, Analytics, ChatAssistant, Profile, NotFound
├── services/         # database.ts (Supabase queries), ai.ts (edge function calls)
└── types/            # TypeScript types for all entities

supabase/
└── functions/        # 6 edge functions (ai-resume-parse, ai-skill-gap, ai-interview, ai-coding, ai-roadmap, ai-chat)
```

## Deployment

### Deploying Edge Functions

Edge functions are deployed via the Supabase MCP tools. The source files are in `supabase/functions/`. Each function is self-contained (no shared imports).

### Deploying the Frontend

```bash
npm run build
# Deploy the dist/ folder to your hosting provider (Vercel, Netlify, AWS S3+CloudFront, etc.)
```

### Setting AI Secrets

In the Supabase dashboard → Edge Functions → Secrets:
- Add `GEMINI_API_KEY` — get from [Google AI Studio](https://aistudio.google.com/)
- Add `GROQ_API_KEY` — get from [Groq Console](https://console.groq.com/)

## Future Improvements

- Voice interview (speech-to-text / text-to-speech)
- Emailed PDF interview reports
- Leaderboard and achievements
- Admin panel
- Interview/coding timers
- Daily streaks and gamification
- Multi-language interview support
- Company-specific question banks

## License

MIT
