import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, FileText, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { jobsApi } from '../../api/jobs';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

export default function OfferListPage() {
  const { t } = useTranslation();
  const { data: jobs, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });

  if (isLoading) return <LoadingSpinner />;

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold gradient-text">{t('offers.title')}</h1>
          <div className="flex gap-3">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link to="/offers/templates" className="flex items-center gap-2 glass-card px-4 py-2 rounded-lg text-slate-700 text-sm font-medium">
                <Settings className="w-4 h-4" /> {t('offers.templates')}
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link to="/offers/generate" className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> {t('offers.generateOffer')}
              </Link>
            </motion.div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('offers.byJob')}</h2>
          <p className="text-sm text-slate-500 mb-4">{t('offers.byJobDesc')}</p>
          <motion.div
            className="space-y-2"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {jobs?.filter(j => j.status === 'open').map(job => (
              <motion.div key={job.id} variants={itemVariants} whileHover={{ x: 4 }}>
                <Link to={`/offers/generate?jobId=${job.id}`} className="flex items-center gap-3 p-3 rounded-xl glass-card hover:bg-white/60 transition-all duration-200">
                  <FileText className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{job.title}</p>
                    <p className="text-xs text-slate-500">{job.department}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </AnimatedPage>
  );
}
