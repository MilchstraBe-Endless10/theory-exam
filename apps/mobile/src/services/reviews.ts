import { useEffect, useState } from 'react';
import { apiRequest, previewMode } from './api';

export type ReviewQuestionType = 'single' | 'multiple' | 'judgement';
export type ReviewTypeFilter = 'all' | ReviewQuestionType;
export type ReviewStrategy = 'random' | 'weak';
export type ReviewQuantity = '10' | '20' | 'all';
export type ReviewScope = 'pending' | 'mastered';
export type MasteryStatus = 'review' | 'reinforcing' | 'mastered';

export interface MistakeStats {
  bankId: string;
  bankVersionId: string;
  review: number;
  reinforcing: number;
  mastered: number;
  byType: Record<ReviewQuestionType, { review: number; reinforcing: number; mastered: number }>;
}

export interface ReviewRound {
  id: string;
  bankId: string;
  bankVersionId: string;
  questionType: ReviewTypeFilter;
  strategy: ReviewStrategy;
  quantity: ReviewQuantity;
  masteryStatus: ReviewScope;
  availableCount: number;
  questionCount: number;
  currentPosition: number;
  submittedCount: number;
  status: 'in_progress' | 'completed' | 'exited';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  exitedAt: string | null;
  reducedToAvailable: boolean;
}

export interface ReviewQuestion {
  id: string;
  bankId: string;
  bankVersionId: string;
  type: ReviewQuestionType;
  stem: string;
  options: Record<string, string>;
  source: { sheet: string; row: number };
  masteryStatus: MasteryStatus;
  wrongCount: number;
  consecutiveCorrectRounds: number;
}

export interface ReviewQuestionPosition {
  question: ReviewQuestion;
  position: number;
  total: number;
  submitted: boolean;
  userAnswer: string[] | null;
}

export interface ReviewFeedback {
  attemptId: string;
  isCorrect: boolean;
  userAnswer: string[];
  correctAnswer: string[];
  correctOptions: Record<string, string>;
  explanation: string;
  submittedAt: string;
  mastery: { status: MasteryStatus; consecutiveCorrectRounds: number };
  progress: { submittedCount: number; totalQuestions: number; currentPosition: number; status: ReviewRound['status'] };
}

export interface ReviewResultItem {
  position: number;
  question: ReviewQuestion;
  result: ReviewFeedback;
}

export interface MistakeItem {
  questionId: string;
  type: ReviewQuestionType;
  stem: string;
  masteryStatus: MasteryStatus;
  consecutiveCorrectRounds: number;
  wrongCount: number;
  updatedAt: string;
}

export function getMistakeStats(bankId: string) {
  return apiRequest<MistakeStats>(`/api/mistakes/stats?bankId=${encodeURIComponent(bankId)}`);
}

export function listMistakes(bankId: string, masteryStatus: 'pending' | 'mastered' | 'all' = 'pending', questionType: ReviewTypeFilter = 'all') {
  return apiRequest<{ items: MistakeItem[]; count: number }>(`/api/mistakes?bankId=${encodeURIComponent(bankId)}&masteryStatus=${masteryStatus}&questionType=${questionType}`);
}

export function createReviewRound(input: {
  bankId: string; questionType: ReviewTypeFilter; strategy: ReviewStrategy; quantity: ReviewQuantity; masteryStatus: ReviewScope;
}) {
  return apiRequest<{ round: ReviewRound; currentQuestion: ReviewQuestionPosition; availableCount: number }>('/api/reviews', { method: 'POST', body: input });
}

export function getActiveReviewRound(bankId: string) {
  return apiRequest<{ round: ReviewRound | null; currentQuestion: ReviewQuestionPosition | null }>(`/api/reviews/active?bankId=${encodeURIComponent(bankId)}`);
}

export function getReviewRound(id: string) {
  return apiRequest<{ round: ReviewRound; currentQuestion: ReviewQuestionPosition | null }>(`/api/reviews/${encodeURIComponent(id)}`);
}

export function getReviewQuestion(id: string, position: number) {
  return apiRequest<ReviewQuestionPosition>(`/api/reviews/${encodeURIComponent(id)}/question?position=${position}`);
}

export function getReviewResult(id: string, position: number) {
  return apiRequest<{ round: ReviewRound; position: number; question: ReviewQuestion; result: ReviewFeedback }>(`/api/reviews/${encodeURIComponent(id)}/result?position=${position}`);
}

export function getReviewResults(id: string) {
  return apiRequest<{ round: ReviewRound; items: ReviewResultItem[] }>(`/api/reviews/${encodeURIComponent(id)}/results`);
}

export function moveReviewPosition(id: string, position: number) {
  return apiRequest<{ round: ReviewRound; currentQuestion: ReviewQuestionPosition }>(`/api/reviews/${encodeURIComponent(id)}/position`, { method: 'POST', body: { position } });
}

export function resumeReviewRound(id: string) {
  return apiRequest<{ round: ReviewRound; currentQuestion: ReviewQuestionPosition | null }>(`/api/reviews/${encodeURIComponent(id)}/resume`, { method: 'POST', body: {} });
}

export function exitReviewRound(id: string) {
  return apiRequest<{ round: ReviewRound }>(`/api/reviews/${encodeURIComponent(id)}/exit`, { method: 'POST', body: {} });
}

export function submitReviewAnswer(id: string, answer: string[]) {
  return apiRequest<ReviewFeedback>(`/api/reviews/${encodeURIComponent(id)}/submit`, { method: 'POST', body: { answer } });
}

export function getReviewHistory(bankId: string) {
  return apiRequest<{ items: Array<ReviewRound & { answeredCount: number; correctCount: number }> }>(`/api/reviews/history?bankId=${encodeURIComponent(bankId)}`);
}

export function useMistakeStats(bankId: string | undefined, userId: string | undefined) {
  const [stats, setStats] = useState<MistakeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (previewMode() || !bankId || !userId) { setStats(null); setLoading(false); setError(''); return; }
    let active = true;
    setLoading(true); setError('');
    getMistakeStats(bankId).then(value => { if (active) setStats(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '错题统计读取失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bankId, userId]);
  return { stats, loading, error, setStats };
}
