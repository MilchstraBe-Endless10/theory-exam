import { apiRequest } from './api';

export type ExamStatus = 'in_progress' | 'submitted' | 'expired' | 'voided';
export interface ExamQuestion {
  position: number; questionId: string; type: 'single' | 'multiple' | 'judgement'; stem: string;
  options: Record<string, string>; source: { sheet: string; row: number } | null;
  answer: string[]; version: number; marked: boolean; updatedAt: string | null;
}
export interface ExamResult {
  examId: string; bankId: string; bankVersionId: string; status: ExamStatus;
  startedAt: string; deadlineAt: string; submittedAt: string; durationSeconds: number;
  score: { total: number; maximum: number; passingScore: number; passed: boolean; single: number; multiple: number; judgement: number };
  counts: { total: number; correct: number; wrong: number; unanswered: number };
  questions: Array<ExamQuestion & { userAnswer: string[]; correctAnswer: string[]; points: number; earnedPoints: number; answered: boolean; isCorrect: boolean | null }>;
}
export interface ExamState {
  session: null | { id: string; bankId: string; bankVersionId: string; status: ExamStatus; startedAt: string; deadlineAt: string; submittedAt: string | null; createdAt: string; totalQuestions: number; rules: Record<string, number>; serverNow: string; remainingSeconds: number };
  questions: ExamQuestion[];
  result: ExamResult | null;
  resumed?: boolean;
}

export function startExam(bankId: string) {
  return apiRequest<ExamState>('/api/exams', { method: 'POST', body: { bankId } });
}
export function getActiveExam() { return apiRequest<ExamState>('/api/exams/active'); }
export function getExam(id: string) { return apiRequest<ExamState>(`/api/exams/${encodeURIComponent(id)}`); }
export function saveExamAnswer(id: string, position: number, input: { answer: string[]; expectedVersion: number; requestId: string; marked: boolean }) {
  return apiRequest<{ position: number; answer: string[]; marked: boolean; version: number; updatedAt: string; idempotent: boolean }>(
    `/api/exams/${encodeURIComponent(id)}/questions/${position}/answer`, { method: 'PUT', body: input },
  );
}
export function submitExam(id: string) {
  return apiRequest<{ result: ExamResult; idempotent: boolean }>(`/api/exams/${encodeURIComponent(id)}/submit`, { method: 'POST', body: {} });
}
export function getExamHistory(bankId?: string) {
  const query = bankId ? `?bankId=${encodeURIComponent(bankId)}` : '';
  return apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/exams/history${query}`);
}
