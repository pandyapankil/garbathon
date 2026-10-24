import { useState, useEffect, useCallback } from 'react';
import { Application } from '../lib/applicationTypes';

const POLL_INTERVAL = 30_000;

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch('/api/applications');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setApplications(data.applications || []);
      setError(null);
    } catch (err) {
      setError('Could not load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  const seedIfEmpty = useCallback(async () => {
    const res = await fetch('/api/applications');
    const data = await res.json();
    if ((data.applications || []).length === 0) {
      setSeeding(true);
      try {
        await fetch('/api/seed', { method: 'POST' });
        await fetchApplications();
      } catch (err) {
        console.error('Seed failed:', err);
      } finally {
        setSeeding(false);
      }
    } else {
      setApplications(data.applications || []);
      setLoading(false);
    }
  }, [fetchApplications]);

  const markFollowedUp = useCallback(async (id: string) => {
    try {
      await fetch(`/api/applications/${id}/followup`, { method: 'PATCH' });
      setApplications(prev =>
        prev.map(a => a.id === id ? { ...a, isFollowUpOverdue: false } : a)
      );
    } catch (err) {
      console.error('Mark follow-up error:', err);
    }
  }, []);

  useEffect(() => {
    seedIfEmpty();
    const interval = setInterval(fetchApplications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [seedIfEmpty, fetchApplications]);

  const byStatus = {
    scam: applications.filter(a => a.status === 'scam'),
    applied: applications.filter(a => a.status === 'applied'),
    interview: applications.filter(a => a.status === 'interview'),
    rejected: applications.filter(a => a.status === 'rejected'),
    offer: applications.filter(a => a.status === 'offer'),
    followUps: applications.filter(a => a.isFollowUpOverdue && a.status !== 'scam'),
  };

  const stats = {
    total: applications.length,
    applied: byStatus.applied.length,
    interview: byStatus.interview.length,
    rejected: byStatus.rejected.length,
    offer: byStatus.offer.length,
    scams: byStatus.scam.length,
    followUps: byStatus.followUps.length,
  };

  return { applications, byStatus, stats, loading, seeding, error, fetchApplications, markFollowedUp };
}
