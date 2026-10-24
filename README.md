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
- **Domain-saturated Gemini system prompt** — scam signals specific to India: training fees, free-email domain impersonation, Aadhaar/PAN requests, PM Yojana fraud patterns
- **Seed-first demo** — 20 pre-classified emails load automatically on first visit; no judge action needed to see the wow moment
- **Structured output** — Gemini returns typed JSON (status, scamReasons[], scamConfidence 0-1, company, role) — no regex parsing, no hallucination slippage

See [docs/prompts/](docs/prompts/) for all AntiGravity prompts used.
See [GOOGLE_SERVICES.md](GOOGLE_SERVICES.md) for exact file paths and API call locations.

## HOW TO ACCESS

**Live URL:** https://promptwars-aug29-yujtd6zcea-el.a.run.app

Open the app — 20 pre-classified emails load automatically within seconds.  
Look for the **RED scam cards at the top** — these are Gemini's flagged scam emails.  
Click any red card to see exactly why Gemini flagged it.

**Demo credentials:**
- Email: `demo@promptwars.com`
- Password: `Demo1234!`

**To test upload:** Download [public/sample-inbox.json](public/sample-inbox.json) and drag it into the upload zone on the landing page.
