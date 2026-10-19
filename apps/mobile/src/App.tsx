import { Navigate, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import { AuthProvider } from './auth/AuthContext';
import AppShell from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import PlaceholderPage from './pages/PlaceholderPage';
import {
  ConnectPage,
  LoginPage,
  MistakesPage,
  PersonalCenterPage,
  PracticeAnswerPage,
  PracticeResultPage,
  PracticeSelectionPage,
  StartPage,
} from './pages/MobilePages';
import { ExamAnswerPage, ExamRecordsPage, ExamResultPage, ExamSettingsPage } from './pages/ExamPages';

export default function App() {
  return <AuthProvider><Routes>
      <Route path="admin" element={<AdminPage />} />
      <Route path="start" element={<StartPage />} />
      <Route path="connect" element={<ConnectPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="practice" element={<PracticeSelectionPage />} />
        <Route path="practice/answer" element={<PracticeAnswerPage />} />
        <Route path="practice/result" element={<PracticeResultPage />} />
        <Route path="exams" element={<ExamSettingsPage />} />
        <Route path="exams/answer" element={<ExamAnswerPage />} />
        <Route path="exams/result" element={<ExamResultPage />} />
        <Route path="mistakes" element={<MistakesPage />} />
        <Route path="records" element={<ExamRecordsPage />} />
        <Route path="favorites" element={<PlaceholderPage page="favorites" />} />
        <Route path="me" element={<PersonalCenterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes></AuthProvider>;
}
