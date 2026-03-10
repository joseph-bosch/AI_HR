import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Pencil, Save, X, StickyNote } from 'lucide-react';
import { interviewsApi } from '../../api/interviews';
import type { Evaluation, EvaluationReport } from '../../types/interview';
import ScoreBadge from '../../components/common/ScoreBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import Card3D from '../../components/common/Card3D';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

export default function EvaluationReportPage() {
  const { t, i18n } = useTranslation();
  const { evalId } = useParams<{ evalId: string }>();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedReport, setEditedReport] = useState<Partial<EvaluationReport>>({});
  const [hrNotes, setHrNotes] = useState('');

  const { data: evaluation, isLoading } = useQuery<Evaluation>({
    queryKey: ['evaluation', evalId],
    queryFn: () => interviewsApi.getEvaluation(evalId!),
  });

  // Initialize HR notes once evaluation data arrives
  useEffect(() => {
    if (evaluation?.hr_notes !== undefined) {
      setHrNotes(evaluation.hr_notes || '');
    }
  }, [evaluation?.id]); // only on initial load (id change)

  const saveMutation = useMutation({
    mutationFn: () => {
      const updatedReport = Object.keys(editedReport).length > 0
        ? { ...evaluation!.generated_report, ...editedReport } as Record<string, unknown>
        : undefined;
      return interviewsApi.updateReport(evalId!, { generated_report: updatedReport, hr_notes: hrNotes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', evalId] });
      setIsEditing(false);
      setEditedReport({});
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: () => interviewsApi.updateReport(evalId!, { hr_notes: hrNotes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evaluation', evalId] }),
  });

  if (isLoading) return <LoadingSpinner message={t('evaluations.report.loadingMsg')} />;
  if (!evaluation) return <p className="text-red-500">{t('evaluations.report.notFound')}</p>;

  const primaryReport = evaluation.generated_report;
  if (!primaryReport) return <p className="text-slate-500">{t('evaluations.report.notGenerated')}</p>;

  const lang = i18n.language;
  const primaryLang = evaluation.primary_language || 'en';
  const baseReport = (lang !== primaryLang && evaluation.report_translations?.[lang]) || primaryReport;
  const displayReport: EvaluationReport = { ...baseReport, ...editedReport } as EvaluationReport;

  const recColor: Record<string, string> = {
    strong_hire: 'from-green-400 to-emerald-500',
    hire: 'from-blue-400 to-cyan-500',
    no_hire: 'from-orange-400 to-amber-500',
    strong_no_hire: 'from-red-400 to-rose-500',
  };
  const gradientClass = recColor[displayReport.overall_recommendation] ?? 'from-slate-400 to-slate-500';

  const textareaClass = 'w-full border border-slate-300/50 rounded-lg px-3 py-2 text-sm bg-white/60 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y';

  return (
    <AnimatedPage>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold gradient-text">{t('evaluations.report.title')}</h1>
              {evaluation.report_edited === 1 && (
                <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  {t('evaluations.report.editedBadge')}
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-1">
              {evaluation.interview_round.replace('_', ' ')} &middot; {evaluation.interviewer_name || 'HR'} &middot; {new Date(evaluation.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isEditing ? (
              <input
                type="number"
                min={0}
                max={100}
                className="w-16 text-center border border-slate-300/50 rounded-lg px-2 py-1 text-sm font-bold bg-white/60 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={editedReport.fit_score ?? displayReport.fit_score}
                onChange={e => setEditedReport(prev => ({ ...prev, fit_score: Number(e.target.value) }))}
              />
            ) : (
              <ScoreBadge score={displayReport.fit_score} size="lg" />
            )}
            {isEditing ? (
              <select
                className="border border-slate-300/50 rounded-lg px-2 py-1.5 text-sm font-medium bg-white/60 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={editedReport.overall_recommendation ?? displayReport.overall_recommendation}
                onChange={e => setEditedReport(prev => ({ ...prev, overall_recommendation: e.target.value }))}
              >
                <option value="strong_hire">strong hire</option>
                <option value="hire">hire</option>
                <option value="no_hire">no hire</option>
                <option value="strong_no_hire">strong no hire</option>
              </select>
            ) : (
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium text-white bg-gradient-to-r ${gradientClass}`}>
                {displayReport.overall_recommendation.replace(/_/g, ' ')}
              </span>
            )}
            {!isEditing ? (
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setEditedReport({}); setIsEditing(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> {t('evaluations.report.editBtn')}
              </motion.button>
            ) : (
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> {saveMutation.isPending ? t('common.saving') : t('common.save')}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setIsEditing(false); setEditedReport({}); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> {t('common.cancel')}
                </motion.button>
              </div>
            )}
          </div>
        </div>

        <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">

          {/* Summary */}
          <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('evaluations.report.summary')}</h2>
            {isEditing ? (
              <textarea className={textareaClass} rows={3}
                value={editedReport.summary ?? displayReport.summary}
                onChange={e => setEditedReport(prev => ({ ...prev, summary: e.target.value }))}
              />
            ) : (
              <p className="text-sm text-slate-600">{displayReport.summary}</p>
            )}
          </motion.div>

          {/* Strengths + Concerns */}
          <div className="grid grid-cols-2 gap-6">
            <motion.div variants={itemVariants}>
              <Card3D glowColor="green">
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-green-700 mb-3">{t('evaluations.report.strengths')}</h2>
                  {isEditing ? (
                    <textarea className={textareaClass} rows={4}
                      value={(editedReport.strengths ?? displayReport.strengths).join('\n')}
                      onChange={e => setEditedReport(prev => ({ ...prev, strengths: e.target.value.split('\n') }))}
                    />
                  ) : (
                    <div className="space-y-2">
                      {displayReport.strengths.map((s: string, i: number) => (
                        <motion.div key={i} className="text-sm text-slate-600 flex gap-2"
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.08 }}>
                          <span className="text-green-500 mt-0.5">+</span> {s}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </Card3D>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card3D glowColor="red">
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-red-700 mb-3">{t('evaluations.report.concerns')}</h2>
                  {isEditing ? (
                    <textarea className={textareaClass} rows={4}
                      value={(editedReport.weaknesses ?? displayReport.weaknesses).join('\n')}
                      onChange={e => setEditedReport(prev => ({ ...prev, weaknesses: e.target.value.split('\n') }))}
                    />
                  ) : (
                    <div className="space-y-2">
                      {displayReport.weaknesses.map((w: string, i: number) => (
                        <motion.div key={i} className="text-sm text-slate-600 flex gap-2"
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.08 }}>
                          <span className="text-red-500 mt-0.5">-</span> {w}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </Card3D>
            </motion.div>
          </div>

          {/* Assessments */}
          <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6 space-y-4">
            {(
              [
                { key: 'technical_assessment' as const, label: t('evaluations.report.technicalAssessment') },
                { key: 'cultural_fit_assessment' as const, label: t('evaluations.report.culturalFit') },
                { key: 'communication_assessment' as const, label: t('evaluations.report.communication') },
              ]
            ).map(({ key, label }) => (
              <div key={key}>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">{label}</h3>
                {isEditing ? (
                  <textarea className={textareaClass} rows={2}
                    value={(editedReport[key] as string | undefined) ?? displayReport[key]}
                    onChange={e => setEditedReport(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-slate-600">{displayReport[key]}</p>
                )}
              </div>
            ))}
          </motion.div>

          {/* Additional Notes */}
          {(displayReport.detailed_notes || isEditing) && (
            <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('evaluations.report.additionalNotes')}</h2>
              {isEditing ? (
                <textarea className={textareaClass} rows={3}
                  value={editedReport.detailed_notes ?? displayReport.detailed_notes}
                  onChange={e => setEditedReport(prev => ({ ...prev, detailed_notes: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{displayReport.detailed_notes}</p>
              )}
            </motion.div>
          )}

          {/* HR Notes — always editable */}
          <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6 border border-amber-200/60">
            <div className="flex items-center gap-2 mb-2">
              <StickyNote className="w-4 h-4 text-amber-500" />
              <h2 className="text-lg font-semibold text-slate-900">{t('evaluations.report.hrNotes')}</h2>
            </div>
            <textarea
              className={`${textareaClass} min-h-[80px]`}
              rows={3}
              placeholder={t('evaluations.report.hrNotesPlaceholder')}
              value={hrNotes}
              onChange={e => setHrNotes(e.target.value)}
            />
            {!isEditing && (
              <div className="flex justify-end mt-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending}
                  className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50 transition-colors font-medium"
                >
                  {saveNotesMutation.isPending ? t('common.saving') : t('evaluations.report.saveNotes')}
                </motion.button>
              </div>
            )}
          </motion.div>

        </motion.div>
      </div>
    </AnimatedPage>
  );
}
