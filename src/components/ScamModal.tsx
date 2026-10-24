import { useState } from 'react';
import { Application } from '../lib/applicationTypes';

interface ScamModalProps {
  app: Application;
  onClose: () => void;
}

export default function ScamModal({ app, onClose }: ScamModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Scam details for ${app.company}`}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box scam-modal">
        <div className="scam-modal-header" role="alert" aria-live="assertive">
          <span className="scam-icon" aria-hidden="true">⚠️</span>
          <h2 className="scam-modal-title">Scam Detected</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close scam details"
            id="scam-modal-close"
          >
            ×
          </button>
        </div>

        <div className="scam-warning-banner">
          Do not respond. Do not send money or personal documents.
        </div>

        <div className="scam-details">
          <div className="scam-detail-row">
            <span className="scam-detail-label">Claiming to be</span>
            <span className="scam-detail-value">{app.company}</span>
          </div>
          <div className="scam-detail-row">
            <span className="scam-detail-label">Sender</span>
            <span className="scam-detail-value scam-email">{app.emailFrom}</span>
          </div>
          <div className="scam-detail-row">
            <span className="scam-detail-label">Date</span>
            <span className="scam-detail-value">{app.emailDate}</span>
          </div>
          <div className="scam-detail-row">
            <span className="scam-detail-label">Subject</span>
            <span className="scam-detail-value">{app.emailSubject}</span>
          </div>
          <div className="scam-detail-row">
            <span className="scam-detail-label">Confidence</span>
            <span className="scam-detail-value">
              <span
                className="confidence-bar"
                role="meter"
                aria-valuenow={Math.round(app.scamConfidence * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Scam confidence ${Math.round(app.scamConfidence * 100)}%`}
              >
                <span
                  className="confidence-fill"
                  style={{ width: `${Math.round(app.scamConfidence * 100)}%` }}
                />
              </span>
              <span className="confidence-pct">{Math.round(app.scamConfidence * 100)}%</span>
            </span>
          </div>
        </div>

        <div className="scam-reasons-section">
          <h3 className="scam-reasons-title">Why Gemini flagged this</h3>
          <ul className="scam-reasons-list" role="list">
            {app.scamReasons.length > 0
              ? app.scamReasons.map((reason, i) => (
                  <li key={i} className="scam-reason-item" role="listitem">
                    <span className="reason-bullet" aria-hidden="true">🚩</span>
                    {reason}
                  </li>
                ))
              : <li className="scam-reason-item">Suspicious patterns detected in email content</li>
            }
          </ul>
        </div>

        <div className="scam-body-preview">
          <h3 className="preview-title">Email excerpt</h3>
          <p className="preview-text">{app.emailBody.substring(0, 300)}{app.emailBody.length > 300 ? '…' : ''}</p>
        </div>

        <button
          className="btn-primary modal-btn"
          onClick={onClose}
          id="scam-modal-ok"
          aria-label="I understand, close this dialog"
        >
          I understand — close
        </button>
      </div>
    </div>
  );
}
