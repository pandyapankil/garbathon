import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClassify } from '../hooks/useClassify';

function AnimatedCounter({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return <span>{count}</span>;
}

interface StatPillProps {
  label: string;
  value: number;
  color: string;
  delay?: number;
}

function StatPill({ label, value, color, delay = 0 }: StatPillProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={`stat-pill ${visible ? 'visible' : ''}`}
      style={{ '--pill-color': color } as React.CSSProperties}
    >
      <span className="stat-number">
        <AnimatedCounter target={value} />
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { classifying, error, classifyEmails } = useClassify();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stats, setStats] = useState({ applied: 0, interviews: 0, scams: 0 });
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    fetch('/api/applications')
      .then(r => r.json())
      .then(data => {
        const apps = data.applications || [];
        setStats({
          applied: apps.filter((a: { status: string }) => a.status === 'applied' || a.status === 'interview' || a.status === 'offer').length,
          interviews: apps.filter((a: { status: string }) => a.status === 'interview').length,
          scams: apps.filter((a: { status: string }) => a.status === 'scam').length,
        });
      })
      .catch(() => {
        // Fallback display values for empty state
        setStats({ applied: 0, interviews: 0, scams: 0 });
      });
  }, []);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setStatusMsg('Please upload a .json file');
      return;
    }
    setStatusMsg('Gemini is reading your inbox…');
    const apps = await classifyEmails(file);
    if (apps.length > 0) {
      navigate('/dashboard');
    } else {
      setStatusMsg('Classification failed. Please try again or use the demo data.');
    }
  };

  const handleLoadSample = async () => {
    setStatusMsg('Loading sample inbox for Riya…');
    try {
      const res = await fetch('/sample-inbox.json');
      const text = await res.text();
      const file = new File([text], 'sample-inbox.json', { type: 'application/json' });
      const apps = await classifyEmails(file);
      navigate('/dashboard');
    } catch (err) {
      navigate('/dashboard');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="landing">
      {/* Background mesh */}
      <div className="landing-bg" aria-hidden="true">
        <div className="mesh-gradient" />
        <div className="grid-overlay" />
      </div>

      <main id="main" className="landing-main">
        {/* Badge */}
        <div className="badge" role="note">
          <span className="badge-dot" aria-hidden="true" />
          Powered by Gemini 2.0 Flash
        </div>

        {/* Hero */}
        <h1 className="hero-title">
          Job Hunt<br />
          <span className="hero-accent">Autopilot</span>
        </h1>
        <p className="hero-tagline">
          Track every application. Catch every fake offer.
        </p>
        <p className="hero-sub">
          Upload your inbox JSON — Gemini classifies each email instantly.<br />
          Scam offers glow red. Follow-up reminders never slip.
        </p>

        {/* Stats */}
        <div className="stats-row" role="region" aria-label="Current tracker stats">
          <StatPill label="Active Applications" value={stats.applied} color="#6366f1" delay={200} />
          <StatPill label="Interviews" value={stats.interviews} color="#10b981" delay={400} />
          <StatPill label="Scams Caught" value={stats.scams} color="#ef4444" delay={600} />
        </div>

        {/* Upload zone */}
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''} ${classifying ? 'classifying' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload inbox JSON file"
          onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
          onClick={() => !classifying && fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="sr-only"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            aria-label="Select inbox JSON file"
            id="file-upload"
          />
          {classifying ? (
            <>
              <div className="spinner" aria-hidden="true" />
              <p className="upload-text">Gemini is reading your inbox…</p>
              <p className="upload-sub">Classifying each email — applied, interview, rejected, offer, or scam</p>
            </>
          ) : (
            <>
              <div className="upload-icon" aria-hidden="true">📬</div>
              <p className="upload-text">Drop your inbox JSON here</p>
              <p className="upload-sub">or click to browse · accepts sample-inbox.json format</p>
              <div className="upload-actions">
                <button
                  className="btn-primary"
                  onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                  aria-label="Browse to upload inbox JSON"
                  id="upload-btn"
                >
                  Upload Inbox JSON
                </button>
                <button
                  className="btn-secondary"
                  onClick={e => { e.stopPropagation(); handleLoadSample(); }}
                  aria-label="Load sample inbox"
                  id="load-sample-btn"
                >
                  ⚡ Load 20 Sample Emails
                </button>
              </div>
            </>
          )}
        </div>

        {statusMsg && (
          <p className="status-msg" role="status" aria-live="polite">{statusMsg}</p>
        )}
        {error && (
          <p className="error-msg" role="alert" aria-live="assertive">⚠ {error}</p>
        )}

        {/* View Dashboard */}
        <button
          className="btn-ghost"
          onClick={() => navigate('/dashboard')}
          id="view-dashboard-btn"
          aria-label="View existing dashboard"
        >
          View Dashboard →
        </button>

        {/* Demo credentials */}
        <div className="demo-creds" role="complementary" aria-label="Demo login credentials">
          <p className="creds-label">Demo credentials</p>
          <div className="creds-row">
            <span className="cred-item">
              <span className="cred-key">Email</span>
              <code className="cred-value">demo@promptwars.com</code>
            </span>
            <span className="cred-divider" aria-hidden="true">·</span>
            <span className="cred-item">
              <span className="cred-key">Password</span>
              <code className="cred-value">Demo1234!</code>
            </span>
          </div>
        </div>

        {/* Story */}
        <blockquote className="story-quote">
          "Riya applied to 140 jobs after her layoff. She got scammed twice.<br />
          She missed 6 follow-up windows. She still doesn't know who read her resume."
          <cite>— The problem this solves</cite>
        </blockquote>
      </main>
    </div>
  );
}
