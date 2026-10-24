import { useState, useRef } from 'react';
import { Application } from '../lib/applicationTypes';

interface UseClassifyReturn {
  classifying: boolean;
  error: string | null;
  classifyEmails: (file: File, idToken?: string) => Promise<Application[]>;
}

export function useClassify(): UseClassifyReturn {
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classifyEmails = async (file: File, idToken?: string): Promise<Application[]> => {
    setClassifying(true);
    setError(null);
    try {
      const text = await file.text();
      const emails = JSON.parse(text);
      if (!Array.isArray(emails)) throw new Error('JSON must be an array of emails');

      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, idToken }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      return data.applications || [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Classification failed';
      setError(msg);
      return [];
    } finally {
      setClassifying(false);
    }
  };

  return { classifying, error, classifyEmails };
}
