export type Status = 'normal' | 'borderline' | 'low' | 'high' | 'critical';

export interface Profile {
  id: string; name: string; relation: string; sex: 'male' | 'female' | null; birthDate: string | null;
}
export interface Result {
  id: string; code: string; name: string; nameBn: string; value: number; unit: string;
  rangeLow: number | null; rangeHigh: number | null; rangeSource: string | null;
  status: Status; direction: string | null; reason: string; explanationBn: string;
}
export interface DraftTest {
  code: string; name: string; raw_name?: string; value: number; unit: string;
  printed_low: number | null; printed_high: number | null; needs_check?: boolean; source_line?: string;
}
export interface Report {
  id: string; profileId: string; status: 'DRAFT' | 'CONFIRMED'; labName: string | null; reportDate: string | null;
  quality: { problems: string[] } | null;
  draft: { tests: DraftTest[]; message: string | null; meta?: { report_date: string | null; lab_name: string | null } | null } | null;
  nextStep: { urgency: string; urgency_text_bn: string; specialist: string | null; specialist_bn: string | null } | null;
  summaryBn: string | null; warnings: { codes: string[]; text: string; text_bn: string }[] | null; disclaimerBn: string; results: Result[]; createdAt: string;
}
export interface HistoryItem {
  id: string; status: string; reportDate: string | null; labName: string | null; createdAt: string;
  testCount: number; flaggedCount: number; urgency: string | null; summaryBn: string | null;
}
export interface Reminder { id: string; profileId: string; title: string; dueDate: string; done: boolean }
export interface Trend {
  code: string; name: string; nameBn: string; unit: string; trend: string; trendBn: string;
  points: { date: string; value: number; status: Status; rangeLow: number | null; rangeHigh: number | null }[];
  latest: { date: string; value: number; status: Status };
}

export interface User {
  id: string; name: string; email: string; phone: string | null; avatar: string | null;
  bloodGroup: string | null; city: string | null; emergencyName: string | null; emergencyPhone: string | null;
  hasPassword: boolean; google: boolean; createdAt: string;
}
