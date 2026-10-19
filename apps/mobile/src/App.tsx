import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import PlaceholderPage from './pages/PlaceholderPage';
import {
  ConnectPage,
  ExamAnswerPage,
  ExamResultPage,
  ExamSettingsPage,
  LoginPage,
  MistakesPage,
  PersonalCenterPage,
  PracticeAnswerPage,
  PracticeResultPage,
  PracticeSelectionPage,
  StartPage,
} from './pages/MobilePages';

export default function App() {
  return (
    <Routes>
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
        <Route path="records" element={<PlaceholderPage page="records" />} />
        <Route path="favorites" element={<PlaceholderPage page="favorites" />} />
        <Route path="me" element={<PersonalCenterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
