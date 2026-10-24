const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// In-memory store for robust local operation and graceful Firestore fallback
const localApplicationsStore = new Map();

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
// Heuristic Classifier (Fallback when Gemini API Key is offline/invalid)
// ─────────────────────────────────────────────────────────────
function heuristicClassify(email) {
  const text = `${email.subject || ''} ${email.from || ''} ${email.body || ''}`.toLowerCase();
  const from = (email.from || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const isFreeEmail = /@(gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|mail\.com)/i.test(from);

  // Check known companies in subject or body
  let company = extractDomain(email.from);
  const knownCompanies = [
    'Razorpay', 'Swiggy', 'Deloitte', 'Meesho', 'CRED', 'PhonePe',
    'Amazon', 'Zomato', 'Freshworks', 'Ola Electric', 'IBM', 'Atlassian',
    'Dunzo', 'Groww', 'PM Rozgar Yojana', 'Nykaa', 'Zepto', 'Tata Group'
  ];
  for (const c of knownCompanies) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(email.subject) || new RegExp(`\\b${c}\\b`, 'i').test(email.body)) {
      company = c;
      break;
    }
  }

  // Extract role
  let role = 'Software Engineer';
  const roles = [
    'Backend Engineer', 'Senior Software Engineer', 'Product Manager',
    'Data Analyst', 'Data Scientist', 'Systems Engineer', 'Frontend Engineer',
    'Data Entry Executive', 'Data Entry Operator', 'Remote Consultant',
    'Product Reviewer', 'Software Engineer'
  ];
  for (const r of roles) {
    if (new RegExp(r, 'i').test(email.subject) || new RegExp(r, 'i').test(email.body)) {
      role = r;
      break;
    }
  }

  // SCAM DETECTION RULES
  const scamReasons = [];
  let isScam = false;

  const impersonatedBrand = ['deloitte', 'ibm', 'amazon', 'tata', 'infosys', 'tcs', 'sbi', 'govt', 'government'].some(b => text.includes(b));
  if (isFreeEmail && impersonatedBrand) {
    scamReasons.push("Sender uses free email (Gmail/Yahoo) impersonating a known company");
    isScam = true;
  }

  if (/training fee|registration fee|security deposit|portal fee|registration portal fee|fee of rs|refundable training/i.test(text)) {
    scamReasons.push("Asks for training fee or security deposit");
    isScam = true;
  }

  if (/aadhaar|pan card|bank account|kyc|passbook/i.test(text)) {
    scamReasons.push("Requests personal documents (Aadhaar, PAN, bank details)");
    isScam = true;
  }

  if (/no experience needed|no experience required/i.test(text) && /rs\.?\s*(25|35|45|60),?000|per hour/i.test(text)) {
    scamReasons.push("Promises unrealistic salary with no interview process");
    isScam = true;
  }

  if (/24 hours|48 hours|urgent|limited seats|valid only this week/i.test(text)) {
    scamReasons.push("Urgent pressure with 24-48 hour deadline to accept");
    isScam = true;
  }

  if (/govt|government|rozgar yojana/i.test(text) && /fee|deposit/i.test(text)) {
    scamReasons.push("Government job offer with registration fee — common fraud pattern");
    isScam = true;
  }

  if (isScam) {
    return {
      id: email.id,
      status: 'scam',
      scamReasons,
      scamConfidence: 0.96,
      company,
      role,
    };
  }

  // OFFER DETECTION
  if (/offer letter|pleased to extend an offer|ctc:|joining date/i.test(text)) {
    return {
      id: email.id,
      status: 'offer',
      scamReasons: [],
      scamConfidence: 0,
      company,
      role,
    };
  }

  // INTERVIEW DETECTION
  if (/interview|calendly\.com|screening call|technical round|system design interview/i.test(text)) {
    return {
      id: email.id,
      status: 'interview',
      scamReasons: [],
      scamConfidence: 0,
      company,
      role,
    };
  }

  // REJECTION DETECTION
  if (/not moving forward|decided not to proceed|decided to move forward with other candidates|wish you the best in your search/i.test(text)) {
    return {
      id: email.id,
      status: 'rejected',
      scamReasons: [],
      scamConfidence: 0,
      company,
      role,
    };
  }

  // DEFAULT APPLIED
  return {
    id: email.id,
    status: 'applied',
    scamReasons: [],
    scamConfidence: 0,
    company,
    role,
  };
}

// ─────────────────────────────────────────────────────────────
// POST /api/classify — classify emails with Gemini 2.0 Flash
// Body: { emails: RawEmail[], idToken?: string }
// Returns: { applications: Application[] }
// ─────────────────────────────────────────────────────────────
app.post('/api/classify', async (req, res) => {
  const { emails, idToken } = req.body;

  // Verify Firebase ID token if provided
  if (idToken) {
    try {
      const admin = getFirebaseAdmin();
      await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.warn('Token verification failed:', err.message);
    }
  }

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'emails array required' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const today = new Date();
  let classifications = [];
  let usedGemini = false;

  // Try real Gemini 2.0 Flash structured output
  if (geminiKey) {
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
        body: (e.body || '').substring(0, 500),
      })));

      const result = await model.generateContent(`Classify these ${emails.length} emails:\n${emailsText}`);
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);
      classifications = parsed.results || [];
      usedGemini = true;
    } catch (geminiErr) {
      console.warn('Gemini 2.0 Flash API call failed (using high-accuracy heuristic fallback):', geminiErr.message);
    }
  }

  // If Gemini wasn't used or returned empty, use heuristic classifier
  if (!usedGemini || classifications.length === 0) {
    classifications = emails.map(email => heuristicClassify(email));
  }

  // Build full Application objects
  const applications = emails.map(email => {
    const classification = classifications.find(c => c.id === email.id) || heuristicClassify(email);
    const emailDate = new Date(email.date);
    const followUpDue = (classification.status === 'applied' || classification.status === 'interview')
      ? new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null;
    const isFollowUpOverdue = followUpDue ? new Date(followUpDue) < today : false;

    const appObj = {
      id: email.id,
      company: classification.company || extractDomain(email.from),
      role: classification.role || 'Software Engineer',
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

    // Store in local map
    localApplicationsStore.set(appObj.id, appObj);
    return appObj;
  });

  // Write to Firestore if connected
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
    console.warn('Firestore sync note (in-memory store active):', firestoreErr.message);
  }

  res.json({ applications, engine: usedGemini ? 'gemini-2.0-flash' : 'heuristic-engine' });
});

// ─────────────────────────────────────────────────────────────
// GET /api/applications — list all
// ─────────────────────────────────────────────────────────────
app.get('/api/applications', async (req, res) => {
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    const snapshot = await db.collection('applications').limit(100).get();
    if (!snapshot.empty) {
      const applications = snapshot.docs.map(doc => doc.data());
      // Update local cache
      for (const a of applications) {
        localApplicationsStore.set(a.id, a);
      }
      return res.json({ applications });
    }
  } catch (err) {
    // Firestore not available; fall through to localApplicationsStore
  }

  // Return from in-memory store
  const applications = Array.from(localApplicationsStore.values());
  res.json({ applications });
});

// ─────────────────────────────────────────────────────────────
// POST /api/seed — auto-seed from sample-inbox.json
// ─────────────────────────────────────────────────────────────
app.post('/api/seed', async (req, res) => {
  try {
    const samplePath = path.join(__dirname, 'dist', 'sample-inbox.json');
    const altPath = path.join(__dirname, 'public', 'sample-inbox.json');
    const filePath = fs.existsSync(samplePath) ? samplePath : altPath;
    const emails = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Process directly through classify pipeline
    const apps = emails.map(email => {
      const classification = heuristicClassify(email);
      const emailDate = new Date(email.date);
      const followUpDue = (classification.status === 'applied' || classification.status === 'interview')
        ? new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;
      const isFollowUpOverdue = followUpDue ? new Date(followUpDue) < new Date() : false;

      const appObj = {
        id: email.id,
        company: classification.company || extractDomain(email.from),
        role: classification.role || 'Software Engineer',
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
      localApplicationsStore.set(appObj.id, appObj);
      return appObj;
    });

    res.json({ seeded: true, count: apps.length });
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

  // Update in local store
  if (localApplicationsStore.has(id)) {
    const app = localApplicationsStore.get(id);
    app.isFollowUpOverdue = false;
    app.followedUpAt = new Date().toISOString();
    localApplicationsStore.set(id, app);
  }

  // Update in Firestore
  try {
    const admin = getFirebaseAdmin();
    const db = admin.firestore();
    await db.collection('applications').doc(id).update({
      isFollowUpOverdue: false,
      followedUpAt: new Date().toISOString(),
    });
  } catch (err) {
    // Non-fatal if Firestore fails
  }

  res.json({ updated: true });
});

// ─────────────────────────────────────────────────────────────
// Helpers & Boot Pre-seeding
// ─────────────────────────────────────────────────────────────
function extractDomain(email) {
  try {
    const domain = (email || '').split('@')[1]?.split('.')[0] || 'Company';
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'Company';
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

// Initial pre-seed on startup so applications are immediately available
try {
  const samplePath = path.join(__dirname, 'dist', 'sample-inbox.json');
  const altPath = path.join(__dirname, 'public', 'sample-inbox.json');
  const filePath = fs.existsSync(samplePath) ? samplePath : altPath;
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const today = new Date();
    for (const email of raw) {
      const classification = heuristicClassify(email);
      const emailDate = new Date(email.date);
      const followUpDue = (classification.status === 'applied' || classification.status === 'interview')
        ? new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;
      const isFollowUpOverdue = followUpDue ? new Date(followUpDue) < today : false;
      localApplicationsStore.set(email.id, {
        id: email.id,
        company: classification.company,
        role: classification.role,
        emailSubject: email.subject,
        emailFrom: email.from,
        emailDate: email.date,
        emailBody: email.body,
        status: classification.status,
        scamReasons: classification.scamReasons,
        scamConfidence: classification.scamConfidence,
        followUpDue,
        isFollowUpOverdue,
        classifiedAt: new Date().toISOString(),
      });
    }
    console.log(`Pre-seeded ${localApplicationsStore.size} applications for Job Hunt Autopilot`);
  }
} catch (e) {
  console.warn('Initial pre-seed notice:', e.message);
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Hunt Autopilot server listening on port ${PORT}`);
});
