import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Loader2, ThumbsUp, Pause, ThumbsDown, CheckCircle2,
  TrendingUp, AlertTriangle, DollarSign, Lightbulb, Send, Bot
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { getPipelineEntry } from '../../api/pipeline';
import { decisionApi, streamDecisionChat } from '../../api/decision';
import { candidatesApi } from '../../api/candidates';
import { jobsApi } from '../../api/jobs';
import type { InterviewDecision, DecisionReport } from '../../types/decision';
import type { ChatMessage } from '../../types/chat';
import ScoreBadge from '../../components/common/ScoreBadge';
import AnimatedPage from '../../components/common/AnimatedPage';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const STAGE_LABELS: Record<string, string> = {
  hr_interview: 'HR Interview',
  dept_interview: 'Dept Interview',
  third_interview: '3rd Interview',
  decision: 'Final',
};

const REC_COLORS: Record<string, string> = {
  hire: 'from-green-400 to-emerald-500',
  strong_hire: 'from-green-400 to-emerald-500',
  hold: 'from-amber-400 to-orange-400',
  reject: 'from-red-400 to-rose-500',
  no_hire: 'from-red-400 to-rose-500',
  strong_no_hire: 'from-red-400 to-rose-500',
};

export default function DecisionPage() {
  const { t, i18n } = useTranslation();
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<'hire' | 'hold' | 'reject' | null>(null);
  const [reason, setReason] = useState('');

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline-entry', pipelineId],
    queryFn: () => getPipelineEntry(pipelineId!),
    enabled: !!pipelineId,
  });

  const { data: decision, isLoading: decisionLoading, error: decisionError } = useQuery<InterviewDecision>({
    queryKey: ['decision', pipelineId],
    queryFn: () => decisionApi.getByPipeline(pipelineId!),
    enabled: !!pipeline,
    retry: false,
  });

  const { data: candidate } = useQuery({
    queryKey: ['candidate', pipeline?.candidate_id],
    queryFn: () => candidatesApi.get(pipeline!.candidate_id),
    enabled: !!pipeline?.candidate_id,
  });

  const { data: job } = useQuery({
    queryKey: ['job', pipeline?.job_id],
    queryFn: () => jobsApi.get(pipeline!.job_id),
    enabled: !!pipeline?.job_id,
  });

  const generateMutation = useMutation({
    mutationFn: () => decisionApi.generate(pipelineId!, i18n.language),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decision', pipelineId] }),
  });

  const finalDecisionMutation = useMutation({
    mutationFn: ({ action, r }: { action: string; r: string }) =>
      decisionApi.setFinalDecision(decision!.id, action, r || undefined),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision', pipelineId] });
      setConfirmAction(null);
      setReason('');
      if (data.final_decision === 'hire') {
        navigate(`/offers/generate?job_id=${pipeline?.job_id}&candidate_id=${pipeline?.candidate_id}`);
      }
    },
  });

  // Auto-generate if decision not found (404)
  const hasNoDecision = !decisionLoading && (decisionError || !decision);
  const candidateName = candidate
    ? `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim()
    : '...';

  const report = decision?.generated_report;

  // Pick translated report fields when UI language differs from generation language
  const lang = i18n.language;
  const primaryLang = decision?.primary_language || 'en';
  const translation = (lang !== primaryLang && decision?.report_translations?.[lang]) || null;

  // Merge: use translated text fields where available, fall back to original report
  const displayReport = report ? {
    ...report,
    strengths_summary: translation?.strengths_summary || report.strengths_summary,
    risk_summary: translation?.risk_summary || report.risk_summary,
    technical_verdict: translation?.technical_verdict || report.technical_verdict,
    cultural_verdict: translation?.cultural_verdict || report.cultural_verdict,
    lessons_learned: translation?.lessons_learned || report.lessons_learned,
    salary_recommendation: {
      ...report.salary_recommendation,
      rationale: translation?.salary_recommendation?.rationale || report.salary_recommendation?.rationale,
    },
    interview_stages_summary: translation?.interview_stages_summary || report.interview_stages_summary,
  } : null;

  if (!pipeline || decisionLoading) return <LoadingSpinner />;

  return (
    <AnimatedPage>
      <div className="max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold gradient-text">{t('decision.title')}</h1>
          <p className="text-slate-500 mt-1">
            {candidateName} &middot; {job?.title || '...'} &middot; {job?.department || ''}
          </p>
        </div>

        <div className="flex gap-6 items-start">
          {/* ── Left column: report ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* No report yet */}
            {hasNoDecision && (
              <div className="glass-card rounded-2xl p-10 text-center">
                <Sparkles className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('decision.noDecision')}</h2>
                <p className="text-sm text-slate-500 mb-6">{t('decision.noDecisionDesc')}</p>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="flex items-center gap-2 mx-auto bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50 shadow-lg shadow-indigo-500/25"
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> {t('decision.generating')}</>
                  ) : (
                    <><Sparkles className="w-5 h-5" /> {t('decision.generateBtn')}</>
                  )}
                </motion.button>
              </div>
            )}

            {/* Report exists */}
            {report && displayReport && (
              <>
                {/* Recommendation banner */}
                <div className={`rounded-2xl p-6 bg-gradient-to-r ${REC_COLORS[report.overall_recommendation] ?? 'from-slate-400 to-slate-500'} text-white`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">{t('decision.recommendation')}</p>
                      <h2 className="text-2xl font-bold capitalize">
                        {report.overall_recommendation.replace(/_/g, ' ')}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-white/80 text-sm">{t('decision.confidence')}</p>
                      <p className="text-3xl font-bold">{report.confidence}%</p>
                    </div>
                  </div>
                  {decision?.final_decision && (
                    <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {t('decision.finalRecorded')}: {decision.final_decision.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Strengths + Risks */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass-card rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <h3 className="text-sm font-semibold text-slate-900">{t('decision.strengths')}</h3>
                    </div>
                    <p className="text-sm text-slate-600">{displayReport.strengths_summary}</p>
                  </div>
                  <div className="glass-card rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-slate-900">{t('decision.risks')}</h3>
                    </div>
                    <p className="text-sm text-slate-600">{displayReport.risk_summary}</p>
                  </div>
                </div>

                {/* Technical + Cultural */}
                <div className="glass-card rounded-2xl p-5 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('decision.technical')}</h3>
                    <p className="text-sm text-slate-700">{displayReport.technical_verdict}</p>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('decision.cultural')}</h3>
                    <p className="text-sm text-slate-700">{displayReport.cultural_verdict}</p>
                  </div>
                </div>

                {/* Salary recommendation */}
                {report.salary_recommendation?.suggested && (
                  <div className="glass-card rounded-2xl p-5 border border-emerald-200/60">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-sm font-semibold text-slate-900">{t('decision.salary')}</h3>
                    </div>
                    <div className="flex items-baseline gap-4 mb-2">
                      <span className="text-2xl font-bold text-emerald-600">
                        {report.salary_recommendation.suggested.toLocaleString()}
                      </span>
                      {report.salary_recommendation.range && (
                        <span className="text-sm text-slate-500">
                          {t('decision.range')}: {report.salary_recommendation.range[0].toLocaleString()} – {report.salary_recommendation.range[1].toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{displayReport.salary_recommendation.rationale}</p>
                  </div>
                )}

                {/* Per-round stage summary */}
                {displayReport.interview_stages_summary?.length > 0 && (
                  <div className="glass-card rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('decision.stages')}</h3>
                    <div className="space-y-3">
                      {displayReport.interview_stages_summary.map((s, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <ScoreBadge score={s.fit_score} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700">{STAGE_LABELS[s.stage] ?? s.stage}</p>
                            <p className="text-xs text-slate-500 truncate">{s.summary}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${REC_COLORS[s.recommendation] ?? 'from-slate-400 to-slate-500'} shrink-0`}>
                            {s.recommendation.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lessons learned */}
                {displayReport.lessons_learned?.length > 0 && (
                  <div className="glass-card rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-slate-900">{t('decision.lessons')}</h3>
                    </div>
                    <ul className="space-y-1">
                      {displayReport.lessons_learned.map((l, i) => (
                        <li key={i} className="text-sm text-slate-600 flex gap-2">
                          <span className="text-amber-400 mt-0.5">•</span> {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action buttons */}
                {!decision?.final_decision && (
                  <div className="glass-card rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('decision.hrDecision')}</h3>
                    <div className="flex gap-3">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setConfirmAction('hire'); setReason(''); }}
                        className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md shadow-green-500/25"
                      >
                        <ThumbsUp className="w-4 h-4" /> {t('decision.hireBtn')}
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setConfirmAction('hold'); setReason(''); }}
                        className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md shadow-amber-400/25"
                      >
                        <Pause className="w-4 h-4" /> {t('decision.holdBtn')}
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setConfirmAction('reject'); setReason(''); }}
                        className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md shadow-red-500/25"
                      >
                        <ThumbsDown className="w-4 h-4" /> {t('decision.rejectBtn')}
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                        className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {generateMutation.isPending ? t('decision.generating') : t('decision.regenerateBtn')}
                      </motion.button>
                    </div>
                  </div>
                )}

                {/* Final decision recorded badge */}
                {decision?.final_decision && (
                  <div className={`rounded-2xl p-5 text-center bg-gradient-to-r ${REC_COLORS[decision.final_decision] ?? 'from-slate-400 to-slate-500'} text-white`}>
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
                    <p className="font-semibold text-lg capitalize">{t(`decision.final.${decision.final_decision}`)}</p>
                    {decision.decision_reason && (
                      <p className="text-sm text-white/80 mt-1">{decision.decision_reason}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Right column: salary chatbot ── */}
          <div className="w-96 shrink-0 sticky top-4">
            {decision ? (
              <SalaryChatPanel decisionId={decision.id} candidateName={candidateName} />
            ) : (
              <div className="glass-card rounded-2xl p-6 text-center text-slate-400 text-sm">
                {t('decision.chatAfterGenerate')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md"
            >
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                {t(`decision.confirm.${confirmAction}Title`)}
              </h2>
              <p className="text-sm text-slate-500 mb-4">{t(`decision.confirm.${confirmAction}Desc`)}</p>
              {(confirmAction === 'reject' || confirmAction === 'hold') && (
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder={t('decision.reasonPlaceholder')}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
                >
                  {t('common.cancel')}
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => finalDecisionMutation.mutate({ action: confirmAction, r: reason })}
                  disabled={finalDecisionMutation.isPending || (confirmAction === 'reject' && !reason.trim())}
                  className={`px-5 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 bg-gradient-to-r ${
                    confirmAction === 'hire' ? 'from-green-500 to-emerald-600' :
                    confirmAction === 'hold' ? 'from-amber-400 to-orange-500' :
                    'from-red-500 to-rose-600'
                  }`}
                >
                  {finalDecisionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.confirm')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}

// ── Salary Chat Panel ─────────────────────────────────────────────────────────

interface SalaryChatPanelProps {
  decisionId: string;
  candidateName: string;
}

function SalaryChatPanel({ decisionId, candidateName }: SalaryChatPanelProps) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');

    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setIsStreaming(true);

    let accumulated = '';
    try {
      for await (const event of streamDecisionChat(decisionId, text, history, i18n.language)) {
        if (event.type === 'token' && event.content) {
          accumulated += event.content;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: accumulated };
            return updated;
          });
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: t('chat.error') };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-slate-100/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('decision.chatTitle')}</p>
            <p className="text-xs text-slate-400">{candidateName}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-8">{t('decision.chatPlaceholder')}</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                : 'bg-white/80 text-slate-700 border border-slate-100'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown>
                    {msg.content || (isStreaming && i === messages.length - 1 ? '▋' : '')}
                  </ReactMarkdown>
                </div>
              ) : msg.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-100/60">
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 border border-slate-200/60 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white/60 max-h-24"
            rows={1}
            placeholder={t('decision.chatInputPlaceholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <motion.button
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
