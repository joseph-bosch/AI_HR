import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Trash2, MessageCircle, X, ClipboardList, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { screeningApi } from '../../api/screening';
import { candidatesApi } from '../../api/candidates';
import { jobsApi } from '../../api/jobs';
import { addToPipeline, getPipelineForJob } from '../../api/pipeline';
import ScoreBadge from '../../components/common/ScoreBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

export default function CandidateRankingPage() {
  const { t, i18n } = useTranslation();
  const { jobId } = useParams<{ jobId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [remarkModal, setRemarkModal] = useState<{ name: string; text: string } | null>(null);

  const { data: job } = useQuery({ queryKey: ['job', jobId], queryFn: () => jobsApi.get(jobId!) });
  const { data: rankings, isLoading } = useQuery({
    queryKey: ['rankings', jobId],
    queryFn: () => screeningApi.getRankings(jobId!),
    refetchInterval: 5000,
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: (candidateId: string) => candidatesApi.delete(candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rankings', jobId] });
      setConfirmDeleteId(null);
    },
  });

  const rescoreMutation = useMutation({
    mutationFn: () => screeningApi.rescoreBatch(jobId!, i18n.language),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rankings', jobId] }),
  });

  const { data: pipelineEntries } = useQuery({
    queryKey: ['pipeline', jobId],
    queryFn: () => getPipelineForJob(jobId!),
    enabled: !!jobId,
  });
  const pipelineCandidateIds = new Set(pipelineEntries?.map(e => e.candidate_id) ?? []);

  const addToPipelineMutation = useMutation({
    mutationFn: (candidateId: string) => addToPipeline(jobId!, candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', jobId] });
      navigate(`/interviews/pipeline?job_id=${jobId}`);
    },
  });

  const candidateIds = rankings ? [...new Set(rankings.map(r => r.candidate_id))] : [];
  const candidateQueries = useQueries({
    queries: candidateIds.map(id => ({
      queryKey: ['candidate', id] as const,
      queryFn: () => candidatesApi.get(id),
      staleTime: 60_000,
    })),
  });
  const candidateMap = new Map(
    candidateIds.map((id, i) => {
      const data = candidateQueries[i]?.data;
      const name = data
        ? [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email || 'Candidate'
        : null;
      return [id, name];
    }),
  );

  if (isLoading) return <LoadingSpinner message={t('screening.loadingRankings')} />;

  const completedRankings = rankings?.filter(r => r.status === 'completed') || [];
  const failedRankings = rankings?.filter(r => r.status === 'failed') || [];
  const visibleRankings = [...completedRankings, ...failedRankings];
  const processingCount = rankings?.filter(r => r.status === 'processing').length || 0;
  const isRescoring = rescoreMutation.isPending || processingCount > 0;

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{t('screening.candidateRankings')}</h1>
            {job && <p className="text-slate-500 mt-1">{job.title} - {job.department}</p>}
          </div>
          <div className="flex items-center gap-3">
            {processingCount > 0 && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-4 py-2 rounded-xl shadow-lg shadow-yellow-400/30">
                <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span className="text-sm font-semibold">{t('screening.aiScoring', { count: processingCount })}</span>
              </div>
            )}
            <motion.button
              onClick={() => rescoreMutation.mutate()}
              disabled={isRescoring}
              whileHover={{ scale: isRescoring ? 1 : 1.03 }}
              whileTap={{ scale: isRescoring ? 1 : 0.97 }}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/25 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRescoring ? 'animate-spin' : ''}`} />
              {t('screening.reRunScreening')}
            </motion.button>
          </div>
        </div>

        {!visibleRankings.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-slate-500">{t('screening.noRankings')}</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            {failedRankings.length > 0 && completedRankings.length === 0 && (
              <div className="flex items-center gap-2 bg-red-50 border-b border-red-100 px-6 py-3 text-sm text-red-600">
                <span className="font-medium">Scoring failed for all candidates.</span>
                <span className="text-red-400">The AI model likely timed out — try switching to a smaller model (e.g. qwen3.5:7b) in your .env file, then Re-run Screening.</span>
              </div>
            )}
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200/50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.rank')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.candidate')}</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.remark')}</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.overall')}</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.skills')}</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.experience')}</th>
                  <th className="text-center px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.education')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.recommendation')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('pipeline.actions.addToPipeline')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('screening.columns.actions')}</th>
                </tr>
              </thead>
              <motion.tbody
                className="divide-y divide-slate-100/50"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {visibleRankings.map((score, i) => (
                  <motion.tr
                    key={score.id}
                    variants={itemVariants}
                    className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm font-bold text-slate-400">#{i + 1}</td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/screening/candidate/${score.candidate_id}`}
                        state={{ jobId }}
                        className="text-blue-600 hover:underline text-sm font-medium"
                      >
                        {candidateMap.get(score.candidate_id) ?? 'Loading…'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        title={t('screening.columns.remark')}
                        onClick={() => {
                          const lang = i18n.language;
                          const translation = lang !== (score.primary_language || 'en') ? score.score_translations?.[lang] : undefined;
                          setRemarkModal({
                            name: candidateMap.get(score.candidate_id) ?? 'Candidate',
                            text: translation?.explanation || score.explanation || '',
                          });
                        }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {score.status === 'failed' ? (
                        <span className="text-xs text-red-400">—</span>
                      ) : (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <ScoreBadge score={score.overall_score} />
                          {job?.target_score != null && (
                            score.overall_score >= job.target_score ? (
                              <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 rounded-full">
                                ✓ {t('screening.passThreshold')}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 px-1.5 rounded-full">
                                ✗ {t('screening.failThreshold')}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">{score.status === 'failed' ? '—' : (score.skill_match_score?.toFixed(0) || '-')}</td>
                    <td className="px-6 py-4 text-center text-sm">{score.status === 'failed' ? '—' : (score.experience_score?.toFixed(0) || '-')}</td>
                    <td className="px-6 py-4 text-center text-sm">{score.status === 'failed' ? '—' : (score.education_score?.toFixed(0) || '-')}</td>
                    <td className="px-6 py-4">
                      {score.status === 'failed'
                        ? <span className="text-xs px-3 py-1 rounded-full font-medium bg-red-100 text-red-600">Scoring failed</span>
                        : <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                            score.recommendation === 'strong_yes' ? 'bg-gradient-to-r from-green-400 to-green-500 text-white' :
                            score.recommendation === 'yes' ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white' :
                            score.recommendation === 'maybe' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' :
                            'bg-gradient-to-r from-red-400 to-red-500 text-white'
                          }`}>{score.recommendation?.replace('_', ' ')}</span>
                      }
                    </td>
                    <td className="px-6 py-4">
                      {score.status === 'completed' && (
                        pipelineCandidateIds.has(score.candidate_id) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-600 font-medium border border-green-200">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {t('pipeline.actions.inPipeline')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToPipelineMutation.mutate(score.candidate_id)}
                            disabled={addToPipelineMutation.isPending}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            {t('pipeline.actions.addToPipeline')}
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {confirmDeleteId === score.candidate_id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => deleteCandidateMutation.mutate(score.candidate_id)}
                            disabled={deleteCandidateMutation.isPending}
                            className="text-xs bg-red-500 text-white px-2 py-1 rounded font-medium hover:bg-red-600 disabled:opacity-50"
                          >
                            {t('common.confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium hover:bg-slate-300"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          title={t('common.deleteCandidate')}
                          onClick={() => setConfirmDeleteId(score.candidate_id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>

      {remarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRemarkModal(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring' as const, stiffness: 320, damping: 26 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-semibold text-slate-800">{t('screening.remarkModal.title')}</h2>
              </div>
              <button type="button" aria-label={t('screening.remarkModal.close')} onClick={() => setRemarkModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3 font-medium">{remarkModal.name}</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {remarkModal.text || t('screening.remarkModal.noRemark')}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setRemarkModal(null)}
                className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('screening.remarkModal.close')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatedPage>
  );
}
