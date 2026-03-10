import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { jobsApi } from '../../api/jobs';
import { candidatesApi } from '../../api/candidates';
import { interviewsApi } from '../../api/interviews';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import Card3D from '../../components/common/Card3D';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

export default function EvaluationListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedJobId = searchParams.get('jobId') || '';

  const [jobId, setJobId] = useState(preselectedJobId);
  const [candidateId, setCandidateId] = useState('');
  const [round, setRound] = useState('phone_screen');
  const [interviewer, setInterviewer] = useState('');

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const { data: candidates } = useQuery({ queryKey: ['candidates'], queryFn: () => candidatesApi.list() });
  const { data: evaluations, isLoading } = useQuery({
    queryKey: ['evaluations', jobId],
    queryFn: () => jobId ? interviewsApi.listByJob(jobId) : Promise.resolve([]),
    enabled: !!jobId,
  });

  const startMutation = useMutation({
    mutationFn: () => interviewsApi.startEvaluation({
      job_id: jobId, candidate_id: candidateId,
      interview_round: round, interviewer_name: interviewer || undefined,
      language: i18n.language,
    }),
    onSuccess: (data) => navigate(`/interviews/evaluate/${data.id}`),
  });

  const inputClass = "w-full border border-slate-300/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white/50 backdrop-blur-sm";

  return (
    <AnimatedPage>
      <div>
        <h1 className="text-3xl font-bold gradient-text mb-6">{t('evaluations.title')}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card3D glowColor="purple">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('evaluations.startNew')}</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('evaluations.fields.job')} *</label>
                  <select className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}>
                    <option value="">{t('evaluations.fields.selectJob')}</option>
                    {jobs?.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('evaluations.fields.candidate')} *</label>
                  <select className={inputClass} value={candidateId} onChange={e => setCandidateId(e.target.value)}>
                    <option value="">{t('evaluations.fields.selectCandidate')}</option>
                    {candidates?.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}` : c.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('evaluations.fields.round')}</label>
                  <select className={inputClass} value={round} onChange={e => setRound(e.target.value)}>
                    <option value="phone_screen">{t('evaluations.rounds.phone_screen')}</option>
                    <option value="round_2">{t('evaluations.rounds.round_2')}</option>
                    <option value="round_3">{t('evaluations.rounds.round_3')}</option>
                    <option value="final">{t('evaluations.rounds.final')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('evaluations.fields.interviewerName')}</label>
                  <input className={inputClass} value={interviewer} onChange={e => setInterviewer(e.target.value)} placeholder={t('evaluations.fields.optional')} />
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => startMutation.mutate()}
                  disabled={!jobId || !candidateId || startMutation.isPending}
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {startMutation.isPending ? t('evaluations.starting') : t('evaluations.startBtn')}
                </motion.button>
              </div>
            </div>
          </Card3D>

          <div className="lg:col-span-2 glass-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('evaluations.recent')}</h2>
            {isLoading ? <LoadingSpinner /> : !evaluations?.length ? (
              <p className="text-slate-500 text-sm">{t('evaluations.noEvaluations')}</p>
            ) : (
              <motion.div
                className="space-y-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {evaluations.map(ev => (
                  <motion.div
                    key={ev.id}
                    variants={itemVariants}
                    className="flex items-center justify-between p-3 glass-card rounded-xl hover:bg-white/60 transition-all duration-200 cursor-pointer"
                    whileHover={{ x: 4 }}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{ev.interview_round.replace('_', ' ')} - {ev.interviewer_name || 'HR'}</p>
                      <p className="text-xs text-slate-500">{new Date(ev.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ev.status === 'completed' ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white' : 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white'}`}>
                        {ev.status}
                      </span>
                      {ev.status === 'completed' ? (
                        <button onClick={() => navigate(`/interviews/report/${ev.id}`)} className="text-sm text-blue-600 hover:underline">{t('evaluations.viewReport')}</button>
                      ) : (
                        <button onClick={() => navigate(`/interviews/evaluate/${ev.id}`)} className="text-sm text-purple-600 hover:underline">{t('evaluations.continue')}</button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
