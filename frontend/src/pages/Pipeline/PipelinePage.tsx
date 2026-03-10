import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, X, Bot, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { jobsApi } from '../../api/jobs';
import { getPipelineForJob, advanceStage, rejectCandidate, getPipelineRemark } from '../../api/pipeline';
import type { PipelineEntryEnriched, PipelineStage } from '../../types/pipeline';
import AnimatedPage from '../../components/common/AnimatedPage';
import ScoreBadge from '../../components/common/ScoreBadge';

const STAGE_LABELS: Record<PipelineStage, string> = {
  hr_interview: 'pipeline.stages.hr_interview',
  dept_interview: 'pipeline.stages.dept_interview',
  third_interview: 'pipeline.stages.third_interview',
  decision: 'pipeline.stages.decision',
};

const STAGE_COLORS: Record<PipelineStage, string> = {
  hr_interview: 'bg-blue-100 text-blue-700 border-blue-200',
  dept_interview: 'bg-orange-100 text-orange-700 border-orange-200',
  third_interview: 'bg-purple-100 text-purple-700 border-purple-200',
  decision: 'bg-green-100 text-green-700 border-green-200',
};

// What stages can come next for each current stage (for advance buttons)
const NEXT_STAGE_OPTIONS: Record<PipelineStage, Array<{ key: string; stage: PipelineStage }>> = {
  hr_interview: [{ key: 'pipeline.actions.advanceDept', stage: 'dept_interview' }],
  dept_interview: [
    { key: 'pipeline.actions.advanceThird', stage: 'third_interview' },
    { key: 'pipeline.actions.advanceDecision', stage: 'decision' },
  ],
  third_interview: [{ key: 'pipeline.actions.advanceDecision', stage: 'decision' }],
  decision: [],
};

function RemarkCell({ pipelineId }: { pipelineId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-remark', pipelineId, lang],
    queryFn: () => getPipelineRemark(pipelineId, lang),
    staleTime: 5 * 60 * 1000, // 5 min per language
  });

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400 italic">
        <Bot className="w-3 h-3 animate-pulse" />
        {t('pipeline.remarkLoading')}
      </span>
    );
  }

  return (
    <span className="text-xs text-slate-600 leading-relaxed">
      {data?.remark ?? '—'}
    </span>
  );
}

function RejectModal({
  entry,
  onClose,
  onConfirm,
  isPending,
}: {
  entry: PipelineEntryEnriched;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">{t('pipeline.rejectModal.title')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">{entry.candidate_name}</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t('pipeline.rejectModal.reasonLabel')} <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
          placeholder={t('pipeline.rejectModal.reasonPlaceholder')}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim() || isPending}
            className="px-4 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {t('pipeline.rejectModal.confirm')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function PipelinePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialJobId = searchParams.get('job_id') ?? '';
  const [selectedJobId, setSelectedJobId] = useState(initialJobId);
  const [rejectTarget, setRejectTarget] = useState<PipelineEntryEnriched | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advanceWarning, setAdvanceWarning] = useState<{
    id: string; stage: PipelineStage; candidateName: string; score: number; threshold: number;
  } | null>(null);

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list({ status: 'open' }) });
  const { data: selectedJob } = useQuery({
    queryKey: ['job', selectedJobId],
    queryFn: () => jobsApi.get(selectedJobId),
    enabled: !!selectedJobId,
  });

  const { data: pipelineEntries, isLoading } = useQuery({
    queryKey: ['pipeline', selectedJobId],
    queryFn: () => getPipelineForJob(selectedJobId),
    enabled: !!selectedJobId,
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) =>
      advanceStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', selectedJobId] });
      setAdvanceError(null);
    },
    onError: (err: any) => {
      setAdvanceError(err?.response?.data?.detail ?? t('pipeline.advanceError'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectCandidate(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', selectedJobId] });
      setRejectTarget(null);
    },
  });

  const handleJobChange = (jobId: string) => {
    setSelectedJobId(jobId);
    setSearchParams(jobId ? { job_id: jobId } : {});
  };

  const activeEntries = pipelineEntries?.filter(e => e.stage_status !== 'rejected') ?? [];
  const rejectedEntries = pipelineEntries?.filter(e => e.stage_status === 'rejected') ?? [];

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{t('pipeline.title')}</h1>
            <p className="text-slate-500 mt-1">{t('pipeline.subtitle')}</p>
          </div>
        </div>

        {/* Job selector */}
        <div className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">{t('pipeline.selectJob')}</label>
          <select
            value={selectedJobId}
            onChange={e => handleJobChange(e.target.value)}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">{t('pipeline.chooseJob')}</option>
            {jobs?.map((job: any) => (
              <option key={job.id} value={job.id}>{job.title} — {job.department}</option>
            ))}
          </select>
        </div>

        {advanceError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {advanceError}
            <button type="button" onClick={() => setAdvanceError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        {!selectedJobId ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-slate-400">{t('pipeline.selectJobFirst')}</p>
          </div>
        ) : isLoading ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-slate-400">{t('common.loading')}</p>
          </div>
        ) : !pipelineEntries?.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-slate-400">{t('pipeline.noCandidates')}</p>
          </div>
        ) : (
          <>
            {/* Active candidates */}
            <div className="glass-card rounded-2xl overflow-hidden mb-6">
              <table className="w-full">
                <thead className="bg-slate-50/50 border-b border-slate-200/50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('pipeline.columns.candidate')}</th>
                    <th className="text-center px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('pipeline.columns.score')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('pipeline.columns.stage')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('pipeline.columns.remark')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('pipeline.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {activeEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{entry.candidate_name}</p>
                          {entry.candidate_email && <p className="text-xs text-slate-400">{entry.candidate_email}</p>}
                          <p className="text-xs text-slate-400 mt-0.5">
                            {entry.completed_evaluations} {t('pipeline.evalsDone')} · {entry.question_sets} {t('pipeline.qSets')}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {entry.overall_score != null ? <ScoreBadge score={entry.overall_score} /> : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full border font-medium ${STAGE_COLORS[entry.current_stage]}`}>
                          {t(STAGE_LABELS[entry.current_stage])}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <RemarkCell pipelineId={entry.id} />
                      </td>
                      <td className="px-6 py-4">
                        {entry.current_stage === 'decision' ? (
                          <a
                            href={`/interviews/pipeline/${entry.id}/decision`}
                            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:opacity-90 transition-opacity"
                          >
                            {t('pipeline.actions.goToDecision')} <ChevronRight className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {NEXT_STAGE_OPTIONS[entry.current_stage].map(opt => (
                              <button
                                key={opt.stage}
                                type="button"
                                onClick={() => {
                                  const threshold = selectedJob?.target_score;
                                  const score = entry.overall_score;
                                  if (threshold != null && score != null && score < threshold) {
                                    setAdvanceWarning({ id: entry.id, stage: opt.stage, candidateName: entry.candidate_name, score, threshold });
                                  } else {
                                    advanceMutation.mutate({ id: entry.id, stage: opt.stage });
                                  }
                                }}
                                disabled={advanceMutation.isPending}
                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                              >
                                {t(opt.key)} <ChevronRight className="w-3 h-3" />
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setRejectTarget(entry)}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium transition-colors"
                            >
                              {t('pipeline.actions.reject')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rejected candidates */}
            {rejectedEntries.length > 0 && (
              <details className="glass-card rounded-2xl overflow-hidden">
                <summary className="px-6 py-3 text-sm font-medium text-slate-500 cursor-pointer select-none">
                  {t('pipeline.rejectedCount', { count: rejectedEntries.length })}
                </summary>
                <table className="w-full border-t border-slate-100">
                  <tbody className="divide-y divide-slate-100/50">
                    {rejectedEntries.map(entry => (
                      <tr key={entry.id} className="opacity-60">
                        <td className="px-6 py-3 text-sm text-slate-700">{entry.candidate_name}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STAGE_COLORS[entry.current_stage]}`}>
                            {t(STAGE_LABELS[entry.current_stage])}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500 italic">{entry.rejection_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            entry={rejectTarget}
            onClose={() => setRejectTarget(null)}
            onConfirm={reason => rejectMutation.mutate({ id: rejectTarget.id, reason })}
            isPending={rejectMutation.isPending}
          />
        )}
        {advanceWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAdvanceWarning(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            >
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{t('pipeline.belowThreshold.title')}</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {t('pipeline.belowThreshold.message', {
                      name: advanceWarning.candidateName,
                      score: advanceWarning.score.toFixed(0),
                      threshold: advanceWarning.threshold,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdvanceWarning(null)}
                  className="px-4 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    advanceMutation.mutate({ id: advanceWarning.id, stage: advanceWarning.stage });
                    setAdvanceWarning(null);
                  }}
                  className="px-4 py-1.5 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
                >
                  {t('pipeline.belowThreshold.proceed')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}
