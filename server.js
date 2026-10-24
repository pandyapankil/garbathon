const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// ─────────────────────────────────────────────────────────────
// GET /api/config — serve Firebase config at runtime
// ─────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FIREBASE_API_KEY not configured' });
  }
  res.json({
    apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/healthz — liveness probe
// ─────────────────────────────────────────────────────────────
app.get('/api/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────
// GET /api/readyz — readiness probe
// ─────────────────────────────────────────────────────────────
app.get('/api/readyz', (req, res) => {
  const ready = !!process.env.FIREBASE_API_KEY && !!process.env.GEMINI_API_KEY;
  if (!ready) {
    return res.status(503).json({ status: 'not ready', reason: 'env vars missing' });
  }
  res.json({ status: 'ready' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/classify — classify emails with Gemini
// Body: { emails: RawEmail[], idToken?: string }
// Returns: { applications: Application[] }
// ─────────────────────────────────────────────────────────────
app.post('/api/classify', async (req, res) => {
  const { emails, idToken } = req.body;

  // Verify Firebase ID token on mutating route
  if (idToken) {
    try {
      const admin = getFirebaseAdmin();
      await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error('Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid auth token' });
    }
  }

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails array required' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const today = new Date();

  try {
    const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiKey);

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        results: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING },
              status: { type: SchemaType.STRING },
              scamReasons: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              scamConfidence: { type: SchemaType.NUMBER },
              company: { type: SchemaType.STRING },
              role: { type: SchemaType.STRING },
            },
            required: ['id', 'status', 'scamReasons', 'scamConfidence', 'company', 'role'],
          },
        },
      },
      required: ['results'],
    };

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
      systemInstruction: `You are an email classifier for a job seeker's inbox after a layoff.

For EACH email in the array, classify it with:
- id: copy the email id exactly
- status: one of "applied" | "interview" | "rejected" | "offer" | "scam"
  * applied: acknowledgement, application received, under review
  * interview: invitation to interview, scheduling a call, technical round
  * rejected: not moving forward, decided to go with other candidates
  * offer: formal offer letter, CTC mentioned, joining date given
  * scam: any of the scam signals below
- scamReasons: array of strings (empty [] if not scam). Use these exact phrases when applicable:
    "Sender uses free email (Gmail/Yahoo) impersonating a known company"
    "Asks for training fee or security deposit"
    "Requests personal documents (Aadhaar, PAN, bank details)"
    "Promises unrealistic salary with no interview process"
    "Urgent pressure with 24-48 hour deadline to accept"
    "Government job offer with registration fee — common fraud pattern"
- scamConfidence: 0.0 to 1.0 (1.0 = definite scam)
- company: extracted company name (e.g. "Razorpay", "Deloitte" — even if impersonated)
- role: extracted job role (e.g. "Software Engineer", "Data Entry Operator")

SCAM DETECTION RULES (be strict):
- Any free email domain (gmail.com, yahoo.com, hotmail.com) claiming to be a large company = scam
- Any request for money, training fee, registration fee, security deposit = scam
- Any request for Aadhaar, PAN, bank account number = scam
- Government job with fee = scam
- "No experience needed" + high salary + immediate joining = strong scam signal

Classify ALL emails provided. Return results for every single id.`,
    });

    const emailsText = JSON.stringify(emails.map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      date: e.date,
      body: e.body.substring(0, 500), // truncate for token efficiency
    })));

    const result = await model.generateContent(`Classify these ${emails.length} emails:\n${emailsText}`);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    const classifications = parsed.results || [];

    // Build Application objects
    const applications = emails.map(email => {
      const classification = classifications.find(c => c.id === email.id) || {
        id: email.id,
        status: 'applied',
        scamReasons: [],
        scamConfidence: 0,
        company: extractDomain(email.from),
        role: 'Unknown Role',
      };

      const emailDate = new Date(email.date);
      const followUpDue = (classification.status === 'applied' || classification.status === 'interview')
        ? new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;
      const isFollowUpOverdue = followUpDue ? new Date(followUpDue) < today : false;

      return {
        id: email.id,
        company: classification.company || extractDomain(email.from),
        role: classification.role || 'Unknown Role',
        emailSubject: email.subject,
        emailFrom: email.from,
        emailDate: email.date,
        emailBody: email.body,
        status: classification.status || 'applied',
        scamReasons: classification.scamReasons || [],
        scamConfidence: classification.scamConfidence || 0,
        followUpDue,
        isFollowUpOverdue,
        classifiedAt: new Date().toISOString(),
      };
    });

    // Write to Firestore
    try {
      const admin = getFirebaseAdmin();
      const db = admin.firestore();
      const batch = db.batch();
      for (const app of applications) {
        const ref = db.collection('applications').doc(app.id);
        batch.set(ref, app, { merge: true });
      }
      await batch.commit();
    } catch (firestoreErr) {
      console.error('Firestore write error (non-fatal):', firestoreErr.message);
    }

    res.json({ applications });
  } catch (err) {
    console.error('Classify error:', err.message);

    // Fallback: classify all as 'applied'
    const fallbackApps = emails.map(email => {
      const emailDate = new Date(email.date);
      const followUpDue = new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return {
        id: email.id,
        company: extractDomain(email.from),
        role: 'Unknown Role',
        emailSubject: email.subject,
        emailFrom: email.from,
        emailDate: email.date,
        emailBody: email.body,
        status: 'applied',
        scamReasons: [],
        scamConfidence: 0,
        followUpDue,
        isFollowUpOverdue: new Date(followUpDue) < today,
        classifiedAt: new Date().toISOString(),
      };
    });
    res.json({ applications: fallbackApps, fallback: true });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/applications — list all from Firestore
// ─────────────────────────────────────────────────────────────
app.get('/api/applications', async (req, res) => {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const snapshot = await db.collection('applications').limit(100).get();
    const applications = snapshot.docs.map(doc => doc.data());
    res.json({ applications });
  } catch (err) {
    console.error('Fetch applications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch applications', applications: [] });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/seed — auto-seed from sample-inbox.json
// ─────────────────────────────────────────────────────────────
app.post('/api/seed', async (req, res) => {
  try {
    const fs = require('fs');
    const samplePath = path.join(__dirname, 'dist', 'sample-inbox.json');
    const altPath = path.join(__dirname, 'public', 'sample-inbox.json');
    const filePath = fs.existsSync(samplePath) ? samplePath : altPath;
    const emails = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Forward to classify
    const classifyRes = await fetch(`http://localhost:${PORT}/api/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });
    const data = await classifyRes.json();
    res.json({ seeded: true, count: data.applications?.length || 0 });
  } catch (err) {
    console.error('Seed error:', err.message);
    res.status(500).json({ error: 'Seed failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/applications/:id/followup — mark follow-up done
// ─────────────────────────────────────────────────────────────
app.patch('/api/applications/:id/followup', async (req, res) => {
  const { id } = req.params;
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    await db.collection('applications').doc(id).update({
      isFollowUpOverdue: false,
      followedUpAt: new Date().toISOString(),
    });
    res.json({ updated: true });
  } catch (err) {
    console.error('Follow-up update error:', err.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function extractDomain(email) {
  try {
    const domain = email.split('@')[1]?.split('.')[0] || 'Unknown';
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'Unknown';
  }
}

let _adminApp = null;
function getFirebaseAdmin() {
  if (_adminApp) return _adminApp;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'promptwars-aug29',
    });
  }
  _adminApp = admin;
  return admin;
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Hunt Autopilot server listening on port ${PORT}`);
});
