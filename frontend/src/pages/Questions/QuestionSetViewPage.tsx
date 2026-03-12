import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Edit, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { questionSetsApi } from '../../api/questionSets';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';
import type { QuestionItem } from '../../types/questionSet';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

/** Returns a field value in the requested language, falling back to the primary field. */
function getField(item: QuestionItem, field: keyof QuestionItem, lang: string, primaryLang: string): string | null {
  if (lang !== primaryLang) {
    const translated = item.translations?.[lang];
    if (translated && field in translated) return (translated as Record<string, string | null>)[field] ?? null;
  }
  return item[field] as string | null;
}

function getRubric(item: QuestionItem, lang: string, primaryLang: string): Record<string, string> | null {
  if (lang !== primaryLang && item.translations?.[lang]?.scoring_rubric) {
    return item.translations[lang].scoring_rubric!;
  }
  return item.scoring_rubric;
}

export default function QuestionSetViewPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data: qs, isLoading } = useQuery({
    queryKey: ['questionSet', id],
    queryFn: () => questionSetsApi.get(id!),
  });

  const handleExportPdf = async () => {
    const blob = await questionSetsApi.exportPdf(id!, i18n.language);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questions_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <LoadingSpinner />;
  if (!qs) return <p className="text-red-500">{t('questions.notFound')}</p>;

  const normCategory = (c: string) => c.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const items = (qs.items || []).map(item => ({ ...item, category: normCategory(item.category) }));
  const categories = ['behavioral', 'situational', 'technical', 'culture_fit'];
  const lang = i18n.language;
  const primaryLang = qs.primary_language || 'en';

  return (
    <AnimatedPage>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold gradient-text">{qs.name}</h1>
            <p className="text-slate-500 text-sm mt-1">{qs.interview_round.replace('_', ' ')} &middot; {t('questions.questionCount', { count: items.length })}</p>
          </div>
          <div className="flex gap-2">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link to={`/questions/${id}/edit`} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 text-sm">
                <Edit className="w-4 h-4" /> {t('common.edit')}
              </Link>
            </motion.div>
            <motion.button
              onClick={handleExportPdf}
              className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white px-3 py-2 rounded-lg hover:from-orange-600 hover:to-pink-600 text-sm shadow-lg shadow-orange-500/25"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <Download className="w-4 h-4" /> {t('questions.exportPdf')}
            </motion.button>
          </div>
        </div>

        {categories.map(cat => {
          const catItems = items.filter(i => i.category === cat);
          if (!catItems.length) return null;
          return (
            <div key={cat} className="mb-8">
              <h2 className="text-lg font-semibold gradient-text mb-3 capitalize">{t(`questions.categoryLabels.${cat}`)}</h2>
              <motion.div
                className="space-y-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {catItems.map((item, i) => {
                  const qText = getField(item, 'question_text', lang, primaryLang);
                  const guidance = getField(item, 'interviewer_guidance', lang, primaryLang);
                  const goodAnswers = getField(item, 'good_answer_indicators', lang, primaryLang);
                  const redFlags = getField(item, 'red_flags', lang, primaryLang);
                  const rubric = getRubric(item, lang, primaryLang);
                  return (
                  <motion.div key={item.id} variants={itemVariants} className="glass-card rounded-2xl p-5">
                    <h3 className="font-medium text-slate-900 mb-3">Q{i + 1}. {qText}</h3>

                    {guidance && (
                      <div className="mb-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t('questions.interviewerGuidance')}</p>
                        <p className="text-sm text-slate-600">{guidance}</p>
                      </div>
                    )}

                    {goodAnswers && (
                      <div className="mb-2">
                        <p className="text-xs font-semibold text-green-600 uppercase mb-1">{t('questions.goodAnswers')}</p>
                        <p className="text-sm text-slate-600">{goodAnswers}</p>
                      </div>
                    )}

                    {redFlags && (
                      <div className="mb-2">
                        <p className="text-xs font-semibold text-red-600 uppercase mb-1">{t('questions.redFlags')}</p>
                        <p className="text-sm text-slate-600">{redFlags}</p>
                      </div>
                    )}

                    {rubric && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t('questions.scoringRubric')}</p>
                        <div className={`grid gap-1 text-xs`} style={{ gridTemplateColumns: `repeat(${Object.keys(rubric).length}, minmax(0, 1fr))` }}>
                          {Object.entries(rubric).map(([score, desc]) => (
                            <div key={score} className="bg-slate-50 p-2 rounded text-center">
                              <span className="font-bold text-slate-900">{score}</span>
                              <p className="text-slate-500 mt-1">{desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                  );
                })}
              </motion.div>
            </div>
          );
        })}
      </div>
    </AnimatedPage>
  );
}
