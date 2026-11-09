import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import AdminPage from './pages/AdminPage';
import { AuthProvider } from './auth/AuthContext';
import AppShell from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import FavoritesPage from './pages/FavoritesPage';
import {
  ConnectPage,
  LoginPage,
  PersonalCenterPage,
  PracticeAnswerPage,
  PracticeResultPage,
  PracticeSelectionPage,
  StartPage,
} from './pages/MobilePages';
import { MistakesPage, ReviewAnswerPage, ReviewHistoryDetailPage } from './pages/MistakePages';
import { ExamAnswerPage, ExamRecordsPage, ExamResultPage, ExamSettingsPage } from './pages/ExamPages';
import { previewMode, savedServerAddress } from './services/api';

function DashboardEntry() {
  const { search } = useLocation();
  if (Capacitor.isNativePlatform() && !savedServerAddress() && !previewMode(search)) return <Navigate to="/start" replace />;
  return <DashboardPage />;
}

export default function App() {
  return <AuthProvider><Routes>
      <Route path="admin" element={<AdminPage />} />
      <Route path="start" element={<StartPage />} />
      <Route path="connect" element={<ConnectPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardEntry />} />
        <Route path="practice" element={<PracticeSelectionPage />} />
        <Route path="practice/answer" element={<PracticeAnswerPage />} />
        <Route path="practice/result" element={<PracticeResultPage />} />
        <Route path="exams" element={<ExamSettingsPage />} />
        <Route path="exams/answer" element={<ExamAnswerPage />} />
        <Route path="exams/result" element={<ExamResultPage />} />
        <Route path="mistakes" element={<MistakesPage />} />
        <Route path="mistakes/review" element={<ReviewAnswerPage />} />
        <Route path="mistakes/history/:id" element={<ReviewHistoryDetailPage />} />
        <Route path="records" element={<ExamRecordsPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="me" element={<PersonalCenterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></AuthProvider>;
}
