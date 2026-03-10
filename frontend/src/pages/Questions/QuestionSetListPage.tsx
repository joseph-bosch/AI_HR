import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { jobsApi } from '../../api/jobs';
import { questionSetsApi } from '../../api/questionSets';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

export default function QuestionSetListPage() {
  const { t } = useTranslation();
  const [selectedJobId, setSelectedJobId] = useState('');

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const { data: questionSets, isLoading } = useQuery({
    queryKey: ['questionSets', selectedJobId],
    queryFn: () => selectedJobId ? questionSetsApi.listByJob(selectedJobId) : Promise.resolve([]),
    enabled: !!selectedJobId,
  });

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold gradient-text">{t('questions.title')}</h1>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link to="/questions/generate" className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-orange-600 hover:to-pink-600 transition-all text-sm font-medium shadow-lg shadow-orange-500/25">
              <Plus className="w-4 h-4" /> {t('questions.generateQuestions')}
            </Link>
          </motion.div>
        </div>

        <div className="mb-6">
          <label htmlFor="qs-filter-job" className="block text-sm font-medium text-slate-700 mb-1">{t('questions.filterByJob')}</label>
          <select
            id="qs-filter-job"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-80 focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={selectedJobId}
            onChange={e => setSelectedJobId(e.target.value)}
          >
            <option value="">{t('questions.selectJob')}</option>
            {jobs?.map(j => <option key={j.id} value={j.id}>{j.title} ({j.department})</option>)}
          </select>
        </div>

        {selectedJobId && isLoading ? <LoadingSpinner /> : selectedJobId && !questionSets?.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <HelpCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('questions.noQuestions')}</p>
          </div>
        ) : questionSets?.length ? (
          <motion.div
            className="grid gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {questionSets.map(qs => (
              <motion.div key={qs.id} variants={itemVariants}>
                <Link to={`/questions/${qs.id}`} className="glass-card rounded-2xl p-5 hover:shadow-md transition-shadow flex items-center justify-between block">
                  <div>
                    <p className="font-medium text-slate-900">{qs.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {qs.interview_round.replace('_', ' ')} &middot; {new Date(qs.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${qs.status === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{qs.status}</span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </div>
    </AnimatedPage>
  );
}
