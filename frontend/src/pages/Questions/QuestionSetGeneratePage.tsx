import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { jobsApi } from '../../api/jobs';
import { questionSetsApi } from '../../api/questionSets';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

const CATEGORIES = ['behavioral', 'situational', 'technical', 'culture_fit'] as const;
type Category = (typeof CATEGORIES)[number];

const DEFAULT_COUNTS: Record<Category, number> = {
  behavioral: 3,
  situational: 2,
  technical: 2,
  culture_fit: 1,
};

const BADGE_CLASSES: Record<Category, string> = {
  behavioral: 'bg-blue-100 text-blue-700',
  situational: 'bg-purple-100 text-purple-700',
  technical: 'bg-green-100 text-green-700',
  culture_fit: 'bg-orange-100 text-orange-700',
};

const COUNT_TEXT_CLASSES: Record<Category, string> = {
  behavioral: 'text-blue-600',
  situational: 'text-purple-600',
  technical: 'text-green-600',
  culture_fit: 'text-orange-600',
};

const ACCENT_CLASSES: Record<Category, string> = {
  behavioral: 'accent-blue-500',
  situational: 'accent-purple-500',
  technical: 'accent-green-500',
  culture_fit: 'accent-orange-500',
};

const BG_CLASSES: Record<Category, string> = {
  behavioral: 'bg-blue-500',
  situational: 'bg-purple-500',
  technical: 'bg-green-500',
  culture_fit: 'bg-orange-500',
};

function sumCounts(counts: Record<Category, number>) {
  return CATEGORIES.reduce((s, c) => s + counts[c], 0);
}

function redistributeProportionally(newTotal: number, current: Record<Category, number>): Record<Category, number> {
  const currentSum = sumCounts(current);
  if (currentSum === 0) return DEFAULT_COUNTS;
  const result = {} as Record<Category, number>;
  let remaining = newTotal;
  CATEGORIES.slice(0, -1).forEach(cat => {
    const count = Math.max(0, Math.round((current[cat] / currentSum) * newTotal));
    result[cat] = count;
    remaining -= count;
  });
  result['culture_fit'] = Math.max(0, remaining);
  return result;
}

export default function QuestionSetGeneratePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [jobId, setJobId] = useState(searchParams.get('jobId') || '');
  const [round, setRound] = useState('phone_screen');
  const [preferences, setPreferences] = useState('');
  const [totalCount, setTotalCount] = useState(8);
  const [categoryCounts, setCategoryCounts] = useState<Record<Category, number>>(DEFAULT_COUNTS);

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });

  const mutation = useMutation({
    mutationFn: () => questionSetsApi.generate({
      job_id: jobId,
      interview_round: round,
      preferences: preferences || undefined,
      language: i18n.language,
      total_count: totalCount,
      category_counts: { ...categoryCounts },
    }),
    onSuccess: (data) => navigate(`/questions/${data.id}/edit`),
  });

  const handleTotalChange = (newTotal: number) => {
    setTotalCount(newTotal);
    setCategoryCounts(redistributeProportionally(newTotal, categoryCounts));
  };

  const handleCategoryChange = (cat: Category, value: number) => {
    const updated = { ...categoryCounts, [cat]: value };
    setCategoryCounts(updated);
    setTotalCount(sumCounts(updated));
  };

  const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
  const allocated = sumCounts(categoryCounts);

  return (
    <AnimatedPage>
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold gradient-text mb-6">{t('questions.generateTitle')}</h1>

        <div className="glass-card rounded-2xl p-6 space-y-5">
          {/* Job */}
          <div>
            <label htmlFor="qs-job" className="block text-sm font-medium text-slate-700 mb-1">{t('questions.fields.job')} *</label>
            <select id="qs-job" className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">{t('questions.fields.selectJob')}</option>
              {jobs?.map(j => <option key={j.id} value={j.id}>{j.title} ({j.department} - {j.seniority_level})</option>)}
            </select>
          </div>

          {/* Round */}
          <div>
            <label htmlFor="qs-round" className="block text-sm font-medium text-slate-700 mb-1">{t('questions.fields.round')}</label>
            <select id="qs-round" className={inputClass} value={round} onChange={e => setRound(e.target.value)}>
              <option value="phone_screen">{t('evaluations.rounds.phone_screen')}</option>
              <option value="round_2">{t('evaluations.rounds.round_2')}</option>
              <option value="round_3">{t('evaluations.rounds.round_3')}</option>
            </select>
          </div>

          {/* Total questions slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">{t('questions.fields.totalCount')}</label>
              <span className="text-lg font-bold text-orange-500">{totalCount}</span>
            </div>
            <input
              type="range"
              min={3}
              max={20}
              value={totalCount}
              onChange={e => handleTotalChange(Number(e.target.value))}
              className="w-full h-2 rounded-full cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-0.5">
              <span>3</span><span>20</span>
            </div>
          </div>

          {/* Category breakdown sliders */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{t('questions.fields.categoryBreakdown')}</span>
              <span className="text-xs text-slate-500">
                {t('questions.fields.totalAllocated', { allocated })}
              </span>
            </div>

            {CATEGORIES.map(cat => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE_CLASSES[cat]}`}>
                    {t(`questions.categories.${cat}`)}
                  </span>
                  <span className={`text-sm font-bold ${COUNT_TEXT_CLASSES[cat]}`}>
                    {categoryCounts[cat]}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={categoryCounts[cat]}
                  onChange={e => handleCategoryChange(cat, Number(e.target.value))}
                  className={`w-full h-1.5 rounded-full cursor-pointer ${ACCENT_CLASSES[cat]}`}
                />
              </div>
            ))}

            {/* Visual breakdown bar */}
            {allocated > 0 && (
              <div className="flex rounded-full overflow-hidden h-2 mt-2">
                {CATEGORIES.map(cat => (
                  categoryCounts[cat] > 0 && (
                    <motion.div
                      key={cat}
                      className={BG_CLASSES[cat]}
                      style={{ width: `${(categoryCounts[cat] / allocated) * 100}%` }}
                      layout
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )
                ))}
              </div>
            )}
          </div>

          {/* Preferences */}
          <div>
            <label htmlFor="qs-preferences" className="block text-sm font-medium text-slate-700 mb-1">{t('questions.fields.preferences')}</label>
            <textarea
              id="qs-preferences"
              className={inputClass}
              rows={3}
              value={preferences}
              onChange={e => setPreferences(e.target.value)}
              placeholder={t('questions.fields.preferencesPlaceholder')}
            />
          </div>

          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <p className="font-medium">{t('questions.generateError', 'Generation failed')}</p>
              <p className="text-xs mt-1 opacity-80">
                {(mutation.error as any)?.response?.data?.detail
                  || (mutation.error as Error)?.message
                  || 'Unknown error'}
              </p>
            </div>
          )}

          <motion.button
            onClick={() => mutation.mutate()}
            disabled={!jobId || mutation.isPending}
            className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white px-4 py-2.5 rounded-lg hover:from-orange-600 hover:to-pink-600 transition-all text-sm font-medium disabled:opacity-50 shadow-lg shadow-orange-500/25"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {mutation.isPending ? t('questions.generating') : t('questions.generateBtn')}
          </motion.button>
        </div>
      </div>
    </AnimatedPage>
  );
}
