import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest, previewMode } from './api';

export interface ExamRules {
  singleCount: number;
  singlePoints: number;
  multipleCount: number;
  multiplePoints: number;
  judgementCount: number;
  judgementPoints: number;
  durationMinutes: number;
  passingScore: number;
}

export interface QuestionBank {
  id: string;
  name: string;
  enabled: boolean;
  activeVersion: null | {
    versionNumber: number;
    questionCount: number;
    typeCounts: Record<string, number>;
  };
  examRules: ExamRules | null;
}

const previewBank: QuestionBank = {
  id: 'preview-level4',
  name: '四级理论题库',
  enabled: true,
  activeVersion: { versionNumber: 1, questionCount: 1283, typeCounts: { single: 845, multiple: 38, judgement: 400 } },
  examRules: { singleCount: 120, singlePoints: 0.5, multipleCount: 20, multiplePoints: 1, judgementCount: 40, judgementPoints: 0.5, durationMinutes: 90, passingScore: 60 },
};

const selectedBankKey = 'theory-exam.selected-bank';

export function useBanks() {
  const { user, serverAddress } = useAuth();
  const preview = previewMode();
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedBankId, setSelectedBankId] = useState(() => localStorage.getItem(selectedBankKey) ?? '');

  useEffect(() => {
    if (preview) {
      setBanks([previewBank]);
      setLoading(false);
      setError('');
      return;
    }
    if (!user || !serverAddress || user.mustChangePassword) {
      setBanks([]);
      setLoading(false);
      setError('');
      return;
    }

    let current = true;
    setLoading(true);
    setError('');
    apiRequest<{ items: QuestionBank[] }>('/api/banks')
      .then(result => { if (current) setBanks(result.items); })
      .catch(requestError => { if (current) setError(requestError instanceof Error ? requestError.message : '题库读取失败。'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [preview, serverAddress, user?.id, user?.mustChangePassword]);

  const activeBank = banks.find(bank => bank.id === selectedBankId) ?? banks[0] ?? null;
  const selectBank = (id: string) => {
    setSelectedBankId(id);
    localStorage.setItem(selectedBankKey, id);
  };

  return { banks, activeBank, loading, error, selectBank, preview };
}
