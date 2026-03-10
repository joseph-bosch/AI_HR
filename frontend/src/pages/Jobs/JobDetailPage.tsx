import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Edit, FileSearch, MessageSquare, FileText, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { jobsApi } from '../../api/jobs';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import Card3D from '../../components/common/Card3D';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

export default function JobDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading } = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id!) });

  if (isLoading) return <LoadingSpinner />;
  if (!job) return <p className="text-red-500">Job not found</p>;

  const actions = [
    { label: t('jobs.detail.actions.screenCandidates'), to: `/screening/job/${id}`, icon: FileSearch, color: 'from-indigo-500 to-indigo-600', glowColor: 'rgba(99, 102, 241, 0.4)' },
    { label: t('jobs.detail.actions.generateQuestions'), to: `/questions/generate?jobId=${id}`, icon: HelpCircle, color: 'from-orange-500 to-orange-600', glowColor: 'rgba(249, 115, 22, 0.4)' },
    { label: t('jobs.detail.actions.viewEvaluations'), to: `/interviews?jobId=${id}`, icon: MessageSquare, color: 'from-purple-500 to-purple-600', glowColor: 'rgba(168, 85, 247, 0.4)' },
    { label: t('jobs.detail.actions.generateOffer'), to: `/offers/generate?jobId=${id}`, icon: FileText, color: 'from-green-500 to-green-600', glowColor: 'rgba(34, 197, 94, 0.4)' },
  ];

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{job.title}</h1>
            <p className="text-slate-500 mt-1">{job.department} &middot; {job.seniority_level} &middot; {job.employment_type}</p>
          </div>
          <Link to={`/jobs/${id}/edit`}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <Edit className="w-4 h-4" /> {t('common.edit')}
            </motion.button>
          </Link>
        </div>

        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {actions.map(action => (
            <motion.div key={action.label} variants={itemVariants}>
              <Link to={action.to}>
                <Card3D glowColor={action.glowColor} className="h-full">
                  <div className={`bg-gradient-to-r ${action.color} text-white px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2`}>
                    <action.icon className="w-4 h-4" /> {action.label}
                  </div>
                </Card3D>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('jobs.detail.description')}</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{job.description}</p>
          </div>

          {job.requirements?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{t('jobs.detail.requirements')}</h3>
              <ul className="list-disc list-inside space-y-1">
                {job.requirements.map((req, i) => <li key={i} className="text-sm text-slate-600">{req}</li>)}
              </ul>
            </div>
          ) : null}

          {job.preferred_skills?.length ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{t('jobs.detail.preferredSkills')}</h3>
              <div className="flex flex-wrap gap-2">
                {job.preferred_skills.map((skill, i) => (
                  <span key={i} className="bg-gradient-to-r from-blue-400 to-blue-500 text-white text-xs px-3 py-1 rounded-full font-medium">{skill}</span>
                ))}
              </div>
            </div>
          ) : null}

          {(job.min_salary || job.max_salary) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">{t('jobs.detail.salaryRange')}</h3>
              <p className="text-sm text-slate-600">
                {job.min_salary && `${job.currency} ${job.min_salary.toLocaleString()}`}
                {job.min_salary && job.max_salary && ' - '}
                {job.max_salary && `${job.currency} ${job.max_salary.toLocaleString()}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </AnimatedPage>
  );
}
