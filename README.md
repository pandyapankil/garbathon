# Job Hunt Autopilot

## PROBLEM

After a layoff, Riya applied to 140 jobs in 6 weeks. She got scammed twice — once by a fake Deloitte HR from a Gmail address asking for a ₹2,500 "training fee," once by a fake IBM recruiter asking for her Aadhaar number. She missed follow-up windows on 11 companies because her inbox was chaos. She still doesn't know who actually read her resume.

## SOLUTION

Job Hunt Autopilot reads your inbox JSON and runs every email through Gemini 2.0 Flash with structured output. Each email is classified as Applied, Interview, Rejected, Offer, or Scam — in one pass. Scam emails appear at the top of the dashboard in red with exact reasons from Gemini. Applied and Interview cards show a yellow "Follow up now" banner after 7 days of silence. One upload. Instant clarity.

## PROMPT ENGINEERING APPROACH

Built using Google Antigravity with Claude Sonnet 4.6 Thinking → Gemini Flash.

**Stack:** Gemini 2.0 Flash structured output (`responseMimeType: application/json` + `responseSchema`), Firestore (`applications` collection, `.limit(100)` on all reads), Firebase Auth (`verifyIdToken()` on `/api/classify`), Cloud Run (asia-south1, Express + Vite).

**Strategy:**
- **Actor-first scaffolding** — all prompts written from Riya's perspective (post-layoff chaos), not as a generic email tool
- **Domain-saturated Gemini system prompt** — grounded in real-world fraud patterns from [Kaggle Real/Fake Job Postings](https://www.kaggle.com/datasets/shivamb/real-or-fake-fake-jobposting-prediction) and [HuggingFace Hinglish Scam Text](https://huggingface.co/datasets/bolewara/hinglish-scam-text-dataset): fake free email domains, training fees, Aadhaar/PAN phishing, PM Rozgar Yojana scams, urgency traps
- **Seed-first demo** — 20 pre-classified emails load automatically on first visit; no judge action needed to see the wow moment
- **Structured output** — Gemini returns typed JSON (status, scamReasons[], scamConfidence 0-1, company, role) — no regex parsing, no hallucination slippage

See [docs/prompts/](docs/prompts/) for all AntiGravity prompts used.  
See [GOOGLE_SERVICES.md](GOOGLE_SERVICES.md) for exact file paths and API call locations.

## HOW TO ACCESS & DEMO

- **Live Cloud Run URL:** https://promptwars-aug29-ucmrnctwfq-el.a.run.app
- **Local Server:** `http://localhost:3000` (or run `npm start`)
- **Run Tests:** `npm test` (8 unit & integration tests passing)
- **Verify Build:** `npm run verify`

### Demo Walkthrough (60 Seconds)
1. **Landing Page (`/`)**: Note the live stat counters, demo credentials (`demo@promptwars.com` / `Demo1234!`), and Riya's story hook.
2. **Instant Demo**: Click **`⚡ Load 20 Sample Emails`** (or drag & drop `public/sample-inbox.json`).
3. **Dashboard (`/dashboard`)**:
   - **🚨 Red Scam Alert Zone**: Top section catches 5 fake offers (Deloitte ₹2,500 training fee, IBM Aadhaar scam, Amazon reviewer fraud, PM Rozgar Yojana, Tata Group data entry).
   - **Scam Details Modal**: Click any red card to see full confidence score and specific fraud flags.
   - **4-Column Kanban**: Applied (6), Interview (5), Rejected (3), Offer (1).
   - **Follow-up Reminders**: Overdue yellow banners on applications silent for >7 days; click **`Mark done`** to resolve.
