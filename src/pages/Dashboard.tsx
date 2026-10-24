import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Application } from '../lib/applicationTypes';
import { useApplications } from '../hooks/useApplications';
import ScamModal from '../components/ScamModal';

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

interface AppCardProps {
  app: Application;
  onScamClick?: (app: Application) => void;
  onFollowUp?: (id: string) => void;
}

function AppCard({ app, onScamClick, onFollowUp }: AppCardProps) {
  const days = daysSince(app.emailDate);

  return (
    <div
      className={`app-card ${app.status}`}
      role="article"
      aria-label={`${app.company} — ${app.role} — ${app.status}`}
    >
      <div className="card-header">
        <div className="card-company">{app.company}</div>
        <div className={`card-status-chip status-${app.status}`} aria-label={`Status: ${app.status}`}>
          {app.status === 'applied' && '📋 Applied'}
          {app.status === 'interview' && '🗓 Interview'}
          {app.status === 'rejected' && '❌ Rejected'}
          {app.status === 'offer' && '🎉 Offer'}
        </div>
      </div>
      <div className="card-role">{app.role}</div>
      <div className="card-meta">
        <span className="card-date">{app.emailDate}</span>
        <span className="card-days">{days}d ago</span>
      </div>
      <div className="card-from">{app.emailFrom}</div>

      {app.isFollowUpOverdue && app.status !== 'scam' && (
        <div className="followup-banner" role="alert" aria-label="Follow-up due">
          <span>⏰ Follow up now — {days} days with no reply</span>
          {onFollowUp && (
            <button
              className="followup-btn"
              onClick={() => onFollowUp(app.id)}
              aria-label={`Mark ${app.company} as followed up`}
              id={`followup-${app.id}`}
            >
              Mark done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ScamCardProps {
  app: Application;
  onClick: (app: Application) => void;
}

function ScamCard({ app, onClick }: ScamCardProps) {
  const days = daysSince(app.emailDate);
  return (
    <div
      className="scam-card"
      role="alert"
      aria-label={`Scam detected from ${app.company}`}
      onClick={() => onClick(app)}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(app)}
    >
      <div className="scam-card-header">
        <div className="scam-badge" aria-label="Scam detected">🚨 SCAM DETECTED</div>
        <div className="scam-confidence">
          {Math.round(app.scamConfidence * 100)}% confidence
        </div>
      </div>
      <div className="scam-card-company">{app.company}</div>
      <div className="scam-card-from">{app.emailFrom}</div>
      <div className="scam-card-subject">{app.emailSubject}</div>
      <ul className="scam-reasons-mini" role="list" aria-label="Scam reasons">
        {app.scamReasons.slice(0, 2).map((r, i) => (
          <li key={i} role="listitem">🚩 {r}</li>
        ))}
        {app.scamReasons.length > 2 && (
          <li role="listitem">+{app.scamReasons.length - 2} more reasons</li>
        )}
      </ul>
      <div className="scam-card-meta">
        <span>{app.emailDate}</span>
        <span>{days}d ago</span>
        <button
          className="scam-details-btn"
          aria-label={`View scam details for ${app.company}`}
          id={`scam-details-${app.id}`}
        >
          View details →
        </button>
      </div>
    </div>
  );
}

interface KanbanLaneProps {
  title: string;
  icon: string;
  apps: Application[];
  color: string;
  onScamClick?: (app: Application) => void;
  onFollowUp?: (id: string) => void;
}

function KanbanLane({ title, icon, apps, color, onScamClick, onFollowUp }: KanbanLaneProps) {
  return (
    <div className="kanban-lane" role="region" aria-label={`${title} column`}>
      <div className="lane-header" style={{ '--lane-color': color } as React.CSSProperties}>
        <span className="lane-icon" aria-hidden="true">{icon}</span>
        <span className="lane-title">{title}</span>
        <span className="lane-count" aria-label={`${apps.length} items`}>{apps.length}</span>
      </div>
      <div className="lane-cards" role="list" aria-label={`${title} applications`}>
        {apps.length === 0 ? (
          <div className="lane-empty" role="listitem">No applications here yet</div>
        ) : (
          apps.map(app => (
            <div key={app.id} role="listitem">
              <AppCard app={app} onScamClick={onScamClick} onFollowUp={onFollowUp} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { byStatus, stats, loading, seeding, error, markFollowedUp } = useApplications();
  const [scamModal, setScamModal] = useState<Application | null>(null);
  const [followupsExpanded, setFollowupsExpanded] = useState(true);

  if (loading || seeding) {
    return (
      <div className="dashboard-loading" role="status" aria-live="polite">
        <div className="spinner large" aria-hidden="true" />
        <p>{seeding ? '🤖 Gemini is classifying your inbox…' : 'Loading applications…'}</p>
        {seeding && <p className="loading-sub">Detecting scams, sorting by status, checking follow-up windows</p>}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Header */}
      <header className="dashboard-header" role="banner">
        <div className="dashboard-brand">
          <button
            className="brand-back"
            onClick={() => navigate('/')}
            aria-label="Back to home"
            id="back-home-btn"
          >
            ←
          </button>
          <span className="brand-name">Job Hunt Autopilot</span>
        </div>
        <p className="dashboard-sub">Riya's inbox · {stats.total} emails processed</p>
      </header>

      <main id="main" className="dashboard-main">
        {/* Stats Strip */}
        <section className="stats-strip" role="region" aria-label="Application summary stats">
          {[
            { label: 'Total', value: stats.total, color: '#6366f1' },
            { label: 'Applied', value: stats.applied, color: '#6366f1' },
            { label: 'Interviews', value: stats.interview, color: '#10b981' },
            { label: 'Rejected', value: stats.rejected, color: '#64748b' },
            { label: 'Offers', value: stats.offer, color: '#f59e0b' },
            { label: '🚨 Scams', value: stats.scams, color: '#ef4444' },
          ].map(s => (
            <div
              key={s.label}
              className="strip-stat"
              style={{ '--stat-color': s.color } as React.CSSProperties}
              aria-label={`${s.label}: ${s.value}`}
            >
              <span className="strip-num">{s.value}</span>
              <span className="strip-label">{s.label}</span>
            </div>
          ))}
        </section>

        {error && (
          <div className="error-banner" role="alert" aria-live="assertive">
            ⚠ {error} — showing cached data
          </div>
        )}

        {/* Scam Section */}
        {byStatus.scam.length > 0 && (
          <section className="scam-section" role="region" aria-label="Scam emails detected">
            <div className="scam-section-header">
              <h2 className="scam-section-title">
                🚨 {byStatus.scam.length} Scam{byStatus.scam.length !== 1 ? 's' : ''} Caught
              </h2>
              <p className="scam-section-sub">
                Gemini flagged these as fraudulent. Click any card for details.
              </p>
            </div>
            <div className="scam-cards-grid" role="list" aria-label="Scam emails">
              {byStatus.scam.map(app => (
                <div key={app.id} role="listitem">
                  <ScamCard app={app} onClick={app => setScamModal(app)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Follow-up reminders */}
        {byStatus.followUps.length > 0 && (
          <section className="followups-section" role="region" aria-label="Follow-up reminders">
            <button
              className="followups-toggle"
              onClick={() => setFollowupsExpanded(e => !e)}
              aria-expanded={followupsExpanded}
              aria-controls="followups-list"
              id="followups-toggle-btn"
            >
              <span>📬 Follow-ups Due ({byStatus.followUps.length})</span>
              <span aria-hidden="true">{followupsExpanded ? '▲' : '▼'}</span>
            </button>
            {followupsExpanded && (
              <div id="followups-list" className="followups-list" role="list" aria-label="Overdue follow-ups">
                {byStatus.followUps.map(app => (
                  <div key={app.id} className="followup-row" role="listitem">
                    <div className="followup-info">
                      <span className="followup-company">{app.company}</span>
                      <span className="followup-role">{app.role}</span>
                      <span className="followup-days">Applied {daysSince(app.emailDate)} days ago — no reply</span>
                    </div>
                    <button
                      className="btn-followup"
                      onClick={() => markFollowedUp(app.id)}
                      aria-label={`Mark ${app.company} as followed up`}
                      id={`followup-row-${app.id}`}
                    >
                      Mark as Followed Up
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Kanban Board */}
        <section className="kanban-board" role="region" aria-label="Application pipeline">
          <h2 className="kanban-title">Application Pipeline</h2>
          <div className="kanban-grid">
            <KanbanLane
              title="Applied"
              icon="📋"
              apps={byStatus.applied}
              color="#6366f1"
              onFollowUp={markFollowedUp}
            />
            <KanbanLane
              title="Interview"
              icon="🗓"
              apps={byStatus.interview}
              color="#10b981"
              onFollowUp={markFollowedUp}
            />
            <KanbanLane
              title="Rejected"
              icon="❌"
              apps={byStatus.rejected}
              color="#64748b"
            />
            <KanbanLane
              title="Offer"
              icon="🎉"
              apps={byStatus.offer}
              color="#f59e0b"
            />
          </div>
        </section>
      </main>

      {/* Scam Modal */}
      {scamModal && (
        <ScamModal app={scamModal} onClose={() => setScamModal(null)} />
      )}
    </div>
  );
}
