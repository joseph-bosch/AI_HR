import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { templatesApi } from '../../api/offers';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

export default function TemplateFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ['template', id], queryFn: () => templatesApi.get(id!), enabled: isEdit,
  });

  const [form, setForm] = useState({ name: '', department: '', role_type: '', content: '' });

  useEffect(() => {
    if (existing) setForm({ name: existing.name, department: existing.department || '', role_type: existing.role_type || '', content: existing.content });
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      isEdit ? templatesApi.update(id!, data) : templatesApi.create(data as never),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); navigate('/offers/templates'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const placeholders = [...form.content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
    mutation.mutate({ ...form, department: form.department || null, role_type: form.role_type || null, placeholders });
  };

  if (isLoading) return <LoadingSpinner />;

  const inputClass = "w-full border border-slate-300/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white/50 backdrop-blur-sm";

  return (
    <AnimatedPage>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold gradient-text mb-6">{isEdit ? t('offers.editTemplate') : t('offers.createTemplate')}</h1>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="tmpl-name" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.templateFields.name')} *</label>
              <input id="tmpl-name" className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="tmpl-department" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.templateFields.department')}</label>
              <input id="tmpl-department" className={inputClass} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder={t('common.optional')} />
            </div>
            <div>
              <label htmlFor="tmpl-role-type" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.templateFields.roleType')}</label>
              <input id="tmpl-role-type" className={inputClass} value={form.role_type} onChange={e => setForm({ ...form, role_type: e.target.value })} placeholder={t('offers.templateFields.roleTypePlaceholder')} />
            </div>
          </div>

          <div>
            <label htmlFor="tmpl-content" className="block text-sm font-medium text-slate-700 mb-1">
              {t('offers.templateFields.content')} * <span className="text-slate-400 font-normal">{t('offers.templateFields.contentNote')}</span>
            </label>
            <textarea
              id="tmpl-content"
              className={`${inputClass} min-h-[400px] font-mono`}
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              placeholder={`Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{position_title}} in our {{department}} department.\n\nYour starting salary will be {{salary}} per year, with a start date of {{start_date}}.\n\n...`}
              required
            />
          </div>

          <div className="flex gap-3">
            <motion.button
              type="submit"
              disabled={mutation.isPending}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {mutation.isPending ? t('common.saving') : isEdit ? t('offers.templateUpdateBtn') : t('offers.templateCreateBtn')}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/offers/templates')}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="bg-gradient-to-r from-slate-400 to-slate-500 text-white px-6 py-2 rounded-lg text-sm"
            >
              {t('common.cancel')}
            </motion.button>
          </div>
        </form>
      </div>
    </AnimatedPage>
  );
}
