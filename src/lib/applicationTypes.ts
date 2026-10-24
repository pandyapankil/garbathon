// Job Hunt Autopilot — core domain types

export type ApplicationStatus = 'applied' | 'interview' | 'rejected' | 'offer' | 'scam';

export interface RawEmail {
  id: string;
  subject: string;
  from: string;
  date: string; // ISO date string
  body: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;          // ISO date
  emailBody: string;
  status: ApplicationStatus;
  scamReasons: string[];      // empty unless status === 'scam'
  scamConfidence: number;     // 0–1
  followUpDue: string | null; // ISO date, 7 days after emailDate
  isFollowUpOverdue: boolean;
  classifiedAt: string;       // ISO timestamp
}

export interface GeminiClassification {
  status: ApplicationStatus;
  scamReasons: string[];
  scamConfidence: number;
  company: string;
  role: string;
}
