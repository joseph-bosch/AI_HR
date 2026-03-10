import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Briefcase, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { jobsApi } from '../../api/jobs';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

export default function JobListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: jobs, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setConfirmDeleteId(null);
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold gradient-text">{t('jobs.title')}</h1>
          <Link to="/jobs/new">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-500/25"
            >
              <Plus className="w-4 h-4" /> {t('jobs.newJob')}
            </motion.button>
          </Link>
        </div>

        {!jobs?.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('jobs.noJobs')}</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200/50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('jobs.columns.title')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('jobs.columns.department')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('jobs.columns.level')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('jobs.columns.status')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('jobs.columns.created')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('jobs.columns.actions')}</th>
                </tr>
              </thead>
              <motion.tbody
                className="divide-y divide-slate-100/50"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {jobs.map(job => (
                  <motion.tr
                    key={job.id}
                    variants={itemVariants}
                    className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/jobs/${job.id}`}
                  >
                    <td className="px-6 py-4">
                      <Link to={`/jobs/${job.id}`} className="font-medium text-blue-600 hover:underline">{job.title}</Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{job.department}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 capitalize">{job.seniority_level}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        job.status === 'open' ? 'bg-gradient-to-r from-green-400 to-green-500 text-white' :
                        job.status === 'closed' ? 'bg-gradient-to-r from-red-400 to-red-500 text-white' :
                        'bg-gradient-to-r from-slate-400 to-slate-500 text-white'
                      }`}>{job.status}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(job.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      {confirmDeleteId === job.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(job.id)}
                            disabled={deleteMutation.isPending}
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
                          title={t('common.deleteJob')}
                          onClick={() => setConfirmDeleteId(job.id)}
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
    </AnimatedPage>
  );
}
