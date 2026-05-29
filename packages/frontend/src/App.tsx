import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import PublicLayout from './layouts/PublicLayout';
import { RequireAuth } from './components/RequireAuth';
import AdminHome from './pages/admin/AdminHome';
import SetupPage from './pages/admin/SetupPage';
import SurveyPage from './pages/admin/SurveyPage';
import ResultsPage from './pages/admin/ResultsPage';
import ThemesPage from './pages/admin/ThemesPage';
import JourneyPage from './pages/admin/JourneyPage';
import TriangulationPage from './pages/admin/TriangulationPage';
import FeasibilityPage from './pages/admin/FeasibilityPage';
import ReportPage from './pages/admin/ReportPage';
import CompareTeamsPage from './pages/admin/CompareTeamsPage';
import AuditPage from './pages/admin/AuditPage';
import UsersPage from './pages/admin/UsersPage';
import QuestionsPage from './pages/admin/QuestionsPage';
import BulkUploadPage from './pages/admin/BulkUploadPage';
import PhasePlaceholder from './pages/admin/PhasePlaceholder';
import SurveyLanding from './pages/survey/SurveyLanding';
import SurveyJoin from './pages/survey/SurveyJoin';
import LoginPage from './pages/auth/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<PublicLayout />}>
        <Route path="/survey/c/:campaignId" element={<SurveyJoin />} />
        <Route path="/survey/:token" element={<SurveyLanding />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="survey" element={<SurveyPage />} />
        <Route path="p1" element={<ResultsPage />} />
        <Route path="p2" element={<ThemesPage />} />
        <Route path="p3" element={<TriangulationPage />} />
        <Route path="p4" element={<JourneyPage />} />
        <Route path="p5" element={<FeasibilityPage />} />
        <Route path="p6" element={<ReportPage />} />
        <Route path="p7" element={<CompareTeamsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="upload" element={<BulkUploadPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
