import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { templatesApi } from '../../api/offers';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

export default function TemplateListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useQuery({ queryKey: ['templates'], queryFn: () => templatesApi.list() });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <AnimatedPage>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold gradient-text">{t('offers.templateTitle')}</h1>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link to="/offers/templates/new" className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> {t('offers.newTemplate')}
            </Link>
          </motion.div>
        </div>

        {!templates?.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-slate-500">{t('offers.noTemplates')}</p>
          </div>
        ) : (
          <motion.div
            className="grid gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {templates.map(tmpl => (
              <motion.div
                key={tmpl.id}
                variants={itemVariants}
                className="glass-card rounded-2xl p-5 flex items-center justify-between"
                whileHover={{ x: 4 }}
              >
                <div>
                  <Link to={`/offers/templates/${tmpl.id}/edit`} className="font-medium text-blue-600 hover:underline">{tmpl.name}</Link>
                  <p className="text-xs text-slate-500 mt-1">
                    {tmpl.department || t('offers.templateFields.allDepartments')} &middot; {tmpl.placeholders?.length || 0} {t('offers.templateFields.placeholders')}
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => deleteMutation.mutate(tmpl.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </AnimatedPage>
  );
}
