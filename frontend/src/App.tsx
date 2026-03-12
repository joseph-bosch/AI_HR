import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/Layout/AppLayout';
import DashboardPage from './pages/Dashboard/DashboardPage';
import JobListPage from './pages/Jobs/JobListPage';
import JobFormPage from './pages/Jobs/JobFormPage';
import JobDetailPage from './pages/Jobs/JobDetailPage';
import ScreeningPage from './pages/Screening/ScreeningPage';
import CandidateRankingPage from './pages/Screening/CandidateRankingPage';
import CandidateDetailPage from './pages/Screening/CandidateDetailPage';
import EvaluationListPage from './pages/Interviews/EvaluationListPage';
import EvaluationFlowPage from './pages/Interviews/EvaluationFlowPage';
import EvaluationReportPage from './pages/Interviews/EvaluationReportPage';
import OfferListPage from './pages/Offers/OfferListPage';
import OfferGeneratePage from './pages/Offers/OfferGeneratePage';
import OfferEditPage from './pages/Offers/OfferEditPage';
import TemplateListPage from './pages/Offers/TemplateListPage';
import TemplateFormPage from './pages/Offers/TemplateFormPage';
import QuestionSetListPage from './pages/Questions/QuestionSetListPage';
import QuestionSetGeneratePage from './pages/Questions/QuestionSetGeneratePage';
import QuestionSetEditPage from './pages/Questions/QuestionSetEditPage';
import QuestionSetViewPage from './pages/Questions/QuestionSetViewPage';
import CandidateListPage from './pages/Candidates/CandidateListPage';
import PipelinePage from './pages/Pipeline/PipelinePage';
import DecisionPage from './pages/Pipeline/DecisionPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />

          {/* Jobs */}
          <Route path="/jobs" element={<JobListPage />} />
          <Route path="/jobs/new" element={<JobFormPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/jobs/:id/edit" element={<JobFormPage />} />

          {/* Candidates */}
          <Route path="/candidates" element={<CandidateListPage />} />

          {/* Screening - Module A */}
          <Route path="/screening" element={<ScreeningPage />} />
          <Route path="/screening/job/:jobId" element={<CandidateRankingPage />} />
          <Route path="/screening/candidate/:candidateId" element={<CandidateDetailPage />} />

          {/* Pipeline - Module B */}
          <Route path="/interviews/pipeline" element={<PipelinePage />} />
          <Route path="/interviews/pipeline/:pipelineId/decision" element={<DecisionPage />} />

          {/* Interviews - Module C */}
          <Route path="/interviews" element={<EvaluationListPage />} />
          <Route path="/interviews/evaluate/:evalId" element={<EvaluationFlowPage />} />
          <Route path="/interviews/report/:evalId" element={<EvaluationReportPage />} />

          {/* Offers - Module D */}
          <Route path="/offers" element={<OfferListPage />} />
          <Route path="/offers/generate" element={<OfferGeneratePage />} />
          <Route path="/offers/:id/edit" element={<OfferEditPage />} />
          <Route path="/offers/templates" element={<TemplateListPage />} />
          <Route path="/offers/templates/new" element={<TemplateFormPage />} />
          <Route path="/offers/templates/:id/edit" element={<TemplateFormPage />} />

          {/* Questions - Module E */}
          <Route path="/questions" element={<QuestionSetListPage />} />
          <Route path="/questions/generate" element={<QuestionSetGeneratePage />} />
          <Route path="/questions/:id/edit" element={<QuestionSetEditPage />} />
          <Route path="/questions/:id" element={<QuestionSetViewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
