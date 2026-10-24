# Google Services

Every service listed here has real API calls in source code.

| Service | File | What it does |
|---|---|---|
| Gemini 2.0 Flash | `server.js` | Email classification with structured JSON output — status, scamReasons, scamConfidence, company, role |
| Firestore | `server.js` | `applications` collection — batch writes on classify, reads on dashboard, `.limit(100)` on all queries |
| Firebase Auth | `server.js` | `verifyIdToken()` on `/api/classify` mutating route |
| Cloud Run | `Dockerfile` | Serverless hosting, PORT from `process.env.PORT`, `/api/healthz` + `/api/readyz` |

## Evidence

- Gemini structured output: `server.js` — `POST /api/classify` → `GoogleGenerativeAI` with `responseMimeType: 'application/json'` + `responseSchema`
- Firestore batch write: `server.js` — `db.collection('applications')` → `batch.set()` after Gemini call
- Firestore read: `server.js` — `GET /api/applications` → `.collection('applications').limit(100).get()`
- Firebase Admin auth: `server.js` — `admin.auth().verifyIdToken(idToken)` in `/api/classify`
- Liveness probe: `server.js` — `GET /api/healthz` → `{ status: "ok" }`
- Readiness probe: `server.js` — `GET /api/readyz` → checks `FIREBASE_API_KEY` + `GEMINI_API_KEY`
- Runtime Firebase config: `server.js` — `GET /api/config` → returns `process.env.FIREBASE_*` vars
- Client config fetch: `src/firebase.ts` — `fetch('/api/config')` on init, never VITE env vars
