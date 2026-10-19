import { useEffect, useState } from 'react';
import { apiRequest, previewMode } from './api';

export type PracticeMode = 'sequential' | 'random' | 'single' | 'multiple' | 'judgement' | 'unanswered' | 'favorites' | 'mistakes';
export type PracticeQuestionType = 'single' | 'multiple' | 'judgement';

export interface PracticeQuestion {
  id: string;
  bankId: string;
  bankVersionId: string;
  type: PracticeQuestionType;
  stem: string;
  options: Record<string, string>;
  source: { sheet: string; row: number };
}

export interface PracticeSession {
  id: string;
  bankId: string;
  bankVersionId: string;
  mode: PracticeMode;
  currentPosition: number;
  questionCount: number;
  submittedCount: number;
  status: 'in_progress' | 'completed' | 'exited';
  createdAt: string;
  updatedAt: string;
}

export interface PracticeProgress {
  bank: { id: string; name: string; bankVersionId: string };
  questionCount: number;
  touchedCount: number;
  unansweredCount: number;
  explorationRate: number | null;
  submissionCount: number;
  correctCount: number;
  accuracyRate: number | null;
  byType: Record<PracticeQuestionType, { questionCount: number; touchedCount: number; submissionCount: number; correctCount: number; accuracyRate: number | null }>;
  favoriteCount: number;
  pendingMistakeCount: number;
  recentSessions: Array<{ id: string; mode: PracticeMode; status: string; questionCount: number; submittedCount: number; createdAt: string; updatedAt: string; attempts: number; correctCount: number }>;
}

export interface PracticeResult {
  attemptId: string;
  isCorrect: boolean;
  userAnswer: string[];
  correctAnswer: string[];
  correctOptions: Record<string, string>;
  explanation: string;
  submittedAt: string;
  progress: { submittedCount: number; correctCount: number; totalQuestions: number; currentPosition: number };
}

export function createPracticeSession(bankId: string, mode: PracticeMode, quantity?: number) {
  return apiRequest<{ session: PracticeSession; currentQuestion: PracticeQuestion }>('/api/practice/sessions', {
    method: 'POST', body: { bankId, mode, ...(quantity ? { quantity } : {}) },
  });
}

export function getActivePracticeSession(bankId: string) {
  return apiRequest<{ session: PracticeSession | null; currentQuestion: PracticeQuestion | null }>(`/api/practice/sessions/active?bankId=${encodeURIComponent(bankId)}`);
}

export function getPracticeSession(sessionId: string) {
  return apiRequest<{ session: PracticeSession; currentQuestion: { question: PracticeQuestion; position: number; total: number; submitted: boolean; userAnswer: string[] | null; isCurrent: boolean } }>(`/api/practice/sessions/${encodeURIComponent(sessionId)}`);
}

export function getPracticeQuestion(sessionId: string, position: number) {
  return apiRequest<{ question: PracticeQuestion; position: number; total: number; submitted: boolean; userAnswer: string[] | null; isCurrent: boolean }>(`/api/practice/sessions/${encodeURIComponent(sessionId)}/question?position=${position}`);
}

export function movePracticePosition(sessionId: string, position: number) {
  return apiRequest<{ session: PracticeSession; currentQuestion: { question: PracticeQuestion; position: number; total: number; submitted: boolean; userAnswer: string[] | null; isCurrent: boolean } }>(`/api/practice/sessions/${encodeURIComponent(sessionId)}/position`, { method: 'POST', body: { position } });
}

export function resumePracticeSession(sessionId: string) {
  return apiRequest<{ session: PracticeSession; currentQuestion: { question: PracticeQuestion; position: number; total: number; submitted: boolean; userAnswer: string[] | null; isCurrent: boolean } }>(`/api/practice/sessions/${encodeURIComponent(sessionId)}/resume`, { method: 'POST', body: {} });
}

export function exitPracticeSession(sessionId: string) {
  return apiRequest<{ session: PracticeSession }>(`/api/practice/sessions/${encodeURIComponent(sessionId)}/exit`, { method: 'POST', body: {} });
}

export function submitPracticeAnswer(sessionId: string, answer: string[]) {
  return apiRequest<PracticeResult>(`/api/practice/sessions/${encodeURIComponent(sessionId)}/submit`, { method: 'POST', body: { answer } });
}

export function getPracticeResult(sessionId: string, position: number) {
  return apiRequest<{ session: PracticeSession; position: number; question: PracticeQuestion; result: PracticeResult }>(`/api/practice/sessions/${encodeURIComponent(sessionId)}/result?position=${position}`);
}

export function setQuestionFavorite(questionId: string, bankId: string, enabled: boolean) {
  const path = `/api/favorites/${encodeURIComponent(questionId)}`;
  return enabled
    ? apiRequest<{ questionId: string; favorite: boolean }>(path, { method: 'PUT', body: { bankId } })
    : apiRequest<{ questionId: string; favorite: boolean }>(`${path}?bankId=${encodeURIComponent(bankId)}`, { method: 'DELETE' });
}

export function getFavorites(bankId: string) {
  return apiRequest<{ items: PracticeQuestion[]; count: number }>(`/api/favorites?bankId=${encodeURIComponent(bankId)}`);
}

export function useLearningProgress(bankId: string | undefined, userId: string | undefined) {
  const [progress, setProgress] = useState<PracticeProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (previewMode() || !bankId || !userId) {
      setProgress(null); setLoading(false); setError(''); return;
    }
    let active = true;
    setLoading(true); setError('');
    apiRequest<PracticeProgress>(`/api/progress?bankId=${encodeURIComponent(bankId)}`)
      .then(value => { if (active) setProgress(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '学习统计读取失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bankId, userId]);
  return { progress, loading, error, setProgress };
}
