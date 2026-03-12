import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Briefcase, FileSearch, MessageSquare, FileText, HelpCircle, ArrowRight, Sparkles } from 'lucide-react';
import { jobsApi } from '../../api/jobs';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import Card3D from '../../components/common/Card3D';
import AnimatedCounter from '../../components/common/AnimatedCounter';
import DashboardStatsPanel from '../../components/dashboard/DashboardStatsPanel';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data: jobs, isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const openJobs = jobs?.filter(j => j.status === 'open') || [];

  const cards = [
    { labelKey: 'dashboard.cards.openJobs', icon: Briefcase, to: '/jobs', gradient: 'from-blue-500 to-indigo-600', glow: 'rgba(99,102,241,0.2)' },
    { labelKey: 'dashboard.cards.screenCandidates', icon: FileSearch, to: '/screening', gradient: 'from-indigo-500 to-purple-600', glow: 'rgba(139,92,246,0.2)' },
    { labelKey: 'dashboard.cards.evaluations', icon: MessageSquare, to: '/interviews', gradient: 'from-purple-500 to-pink-600', glow: 'rgba(168,85,247,0.2)' },
    { labelKey: 'dashboard.cards.offerLetters', icon: FileText, to: '/offers', gradient: 'from-emerald-500 to-cyan-600', glow: 'rgba(16,185,129,0.2)' },
    { labelKey: 'dashboard.cards.questionSets', icon: HelpCircle, to: '/questions', gradient: 'from-orange-500 to-amber-500', glow: 'rgba(249,115,22,0.2)' },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <AnimatedPage>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">{t('dashboard.title')}</h1>
        </div>
        <p className="text-slate-500 ml-14">{t('dashboard.subtitle')}</p>
      </div>

      <DashboardStatsPanel />

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {cards.map((card, i) => (
          <motion.div key={card.labelKey} variants={cardVariants}>
            <Link to={card.to}>
              <Card3D glowColor={card.glow}>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${card.gradient} shadow-lg`}>
                    <card.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 font-medium">{t(card.labelKey)}</p>
                    {i === 0 && (
                      <AnimatedCounter value={openJobs.length} className="text-3xl font-bold text-slate-900" />
                    )}
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-300" />
                </div>
              </Card3D>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {openJobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Card3D glowColor="rgba(59,130,246,0.1)" className="!p-0 overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100/50">
              <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.openPositions')}</h2>
            </div>
            <div className="p-4 space-y-1">
              {openJobs.map((job, idx) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + idx * 0.05 }}
                >
                  <Link
                    to={`/jobs/${job.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-indigo-50/50 transition-colors group"
                  >
                    <div>
                      <p className="font-medium text-slate-900 group-hover:text-indigo-700 transition-colors">{job.title}</p>
                      <p className="text-sm text-slate-500">{job.department} &middot; {job.seniority_level}</p>
                    </div>
                    <span className="text-xs bg-gradient-to-r from-green-400 to-emerald-500 text-white px-3 py-1 rounded-full font-medium shadow-sm">
                      {job.status}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </Card3D>
        </motion.div>
      )}
    </AnimatedPage>
  );
}
