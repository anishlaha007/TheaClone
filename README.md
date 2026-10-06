# aehT

A free, open-source AI study app. Upload your notes, slides, PDFs, photos of handwritten notes, lecture audio or video, YouTube links or web pages, and aehT builds a full study kit from them:

- **Smart Study**: adaptive rounds of mixed questions (multiple choice, scenario, true/false, fill-in-the-blank, written answers graded by AI, put-in-order) that target your weakest concepts and get harder as mastery grows
- **Flashcards**: flip, star, sort into "still learning" / "know it", read aloud, AI explanations, plus spaced-repetition review (SM-2)
- **Practice tests**: timed, exam-style, AI-graded, with per-concept breakdowns and history
- **Study guides & summaries**: streamed Markdown with math (KaTeX) and tables; download or print to PDF
- **Podcasts**: two-host episode script with Gemini multi-speaker audio (or the device's voices)
- **Games**: Definition Match, Stacker, Term Builder
- **AI tutor chat** grounded in your material
- Folders, streaks, accuracy stats, light/dark theme, 80+ output languages, JSON backup/import
- Accounts (Google, GitHub, or email/password) with everything saved per user in Supabase

aehT is an independent project and is not affiliated with any commercial study app.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- Supabase: Auth (OAuth + email), Postgres with row-level security, Storage
- Google Gemini via a Vercel Function (`api/gemini.ts`) that keeps the API key on the server

## Deploy (Vercel + Supabase)

### 1. Set up the database

In the [Supabase dashboard](https://supabase.com/dashboard), open your project → **SQL Editor** → **New query**, paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it. It creates the tables, row-level security policies, the per-user AI usage counter and the private storage buckets. It is safe to run again.

### 2. Turn on sign-in providers

In Supabase → **Authentication**:

- **Providers → Email**: on by default.
- **Providers → Google**: create an OAuth client in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Web application). Add `https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI, then paste the client ID and secret into Supabase.
- **Providers → GitHub**: create an OAuth App in GitHub (Settings → Developer settings → OAuth Apps) with the same callback URL, then paste the client ID and secret into Supabase.
- **URL Configuration**: set **Site URL** to your Vercel URL (e.g. `https://aeht.vercel.app`) and add `https://aeht.vercel.app/**` and `http://localhost:5173/**` to **Redirect URLs**.

### 3. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repository. Vercel detects Vite automatically (settings are in `vercel.json`).
2. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your Supabase publishable key |
   | `GEMINI_API_KEY` | your Gemini key from [Google AI Studio](https://aistudio.google.com/apikey) (**secret**) |
   | `DAILY_AI_LIMIT` | optional, max AI requests per user per day (default 400) |

3. Click **Deploy**.

`GEMINI_API_KEY` is only read by the server function. It is never sent to the browser. Never give it a `NEXT_PUBLIC_` or `VITE_` prefix, and never commit it.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npx vercel dev               # runs the frontend and the /api function together
```

`npm run dev` runs the frontend alone. AI features then need the `/api` function (use `vercel dev`), or a personal Gemini key pasted in **Settings → AI model → Use my own Gemini API key**, which calls Google directly from the browser.

```bash
npm run typecheck   # app + API function
npm run build
```

## How data is stored

| What | Where |
| --- | --- |
| Profile, settings, streak/activity | `public.profiles` |
| Folders | `public.folders` |
| Study kits (cards, questions, mastery, guide, summary, podcast script, chat, test history) | `public.kits.data` (jsonb) |
| Extracted source material | `public.kits.source_text` (loaded only when a kit is opened) |
| Uploaded original files | Storage bucket `sources/<user id>/…` (private) |
| Podcast audio | Storage bucket `podcasts/<user id>/…` (private) |
| Daily AI request counts | `public.ai_usage` |

Every table and bucket is protected by row-level security, so a user can only read or write their own rows and files.

## License

MIT
