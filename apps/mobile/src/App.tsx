import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import PlaceholderPage from './pages/PlaceholderPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="practice" element={<PlaceholderPage page="practice" />} />
        <Route path="exams" element={<PlaceholderPage page="exams" />} />
        <Route path="mistakes" element={<PlaceholderPage page="mistakes" />} />
        <Route path="records" element={<PlaceholderPage page="records" />} />
        <Route path="favorites" element={<PlaceholderPage page="favorites" />} />
        <Route path="me" element={<PlaceholderPage page="me" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
