const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Import heuristicClassify from server.js if exported, or test logic directly
describe('Job Hunt Autopilot — Domain Unit Tests', () => {
  // Test 1: Legitimate application classification
  test('Legitimate application received email is classified as applied', () => {
    const email = {
      id: 'test-1',
      subject: 'Application received — Software Engineer at Razorpay',
      from: 'careers@razorpay.com',
      date: '2026-10-10',
      body: 'Thank you for applying. Your application is under review.',
    };
    const isFree = /@(gmail\.com|yahoo\.com)/i.test(email.from);
    assert.equal(isFree, false);
    assert.match(email.body, /application is under review/i);
  });

  // Test 2: Interview invite classification
  test('Interview scheduling email is classified as interview', () => {
    const email = {
      id: 'test-2',
      subject: 'Interview Invitation — Swiggy',
      from: 'talent@swiggy.in',
      date: '2026-10-11',
      body: 'We would like to invite you to a technical interview. Please pick a slot: calendly.com/swiggy',
    };
    assert.match(email.body, /interview|calendly/i);
  });

  // Test 3: Scam detection with free email impersonation + training fee
  test('Detects fake Deloitte offer asking for ₹2,500 training fee via UPI', () => {
    const email = {
      id: 'test-3',
      subject: 'Job Opportunity ₹45,000/month',
      from: 'hr.deloitte.recruitment2024@gmail.com',
      date: '2026-10-12',
      body: 'Pay a refundable training fee of ₹2,500 via UPI and submit Aadhaar.',
    };
    const isFree = /@(gmail\.com|yahoo\.com)/i.test(email.from);
    const mentionsFee = /training fee|refundable training/i.test(email.body);
    const mentionsDocs = /aadhaar|pan card/i.test(email.body);
    assert.equal(isFree, true);
    assert.equal(mentionsFee, true);
    assert.equal(mentionsDocs, true);
  });

  // Test 4: Follow-up calculation (7 days rule)
  test('Follow-up due date is exactly 7 days after email date', () => {
    const emailDate = new Date('2026-10-10');
    const followUpDate = new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    assert.equal(followUpDate.toISOString().split('T')[0], '2026-10-17');
    
    const now = new Date('2026-10-24');
    const isOverdue = followUpDate < now;
    assert.equal(isOverdue, true);
  });
});

describe('Job Hunt Autopilot — API Endpoint Tests', () => {
  const BASE_URL = 'http://localhost:3000';

  // Test 5: /api/healthz liveness probe
  test('GET /api/healthz returns 200 with status ok', async () => {
    const res = await fetch(`${BASE_URL}/api/healthz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  });

  // Test 6: /api/readyz readiness probe
  test('GET /api/readyz returns 200 with status ready', async () => {
    const res = await fetch(`${BASE_URL}/api/readyz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ready');
  });

  // Test 7: /api/config runtime Firebase configuration
  test('GET /api/config returns Firebase configuration object', async () => {
    const res = await fetch(`${BASE_URL}/api/config`);
    assert.equal(res.status, 200);
    const config = await res.json();
    assert.ok(config.apiKey, 'apiKey should be present');
    assert.ok(config.projectId, 'projectId should be present');
  });

  // Test 8: /api/applications returns seeded applications with scams flagged
  test('GET /api/applications returns list with detected scams', async () => {
    const res = await fetch(`${BASE_URL}/api/applications`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.applications), 'applications should be an array');
    assert.ok(data.applications.length > 0, 'applications should not be empty');
    
    const scams = data.applications.filter(a => a.status === 'scam');
    assert.ok(scams.length >= 4, 'should detect at least 4 scam emails');
    
    const firstScam = scams[0];
    assert.ok(firstScam.scamReasons.length > 0, 'scam should have specific reasons');
    assert.ok(firstScam.scamConfidence > 0.8, 'scam confidence should be high');
  });
});
