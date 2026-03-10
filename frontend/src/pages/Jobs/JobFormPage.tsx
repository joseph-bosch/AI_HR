import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Sparkles, Plus, X, Upload } from 'lucide-react';
import { jobsApi, streamGenerateDescription } from '../../api/jobs';
import type { WeightedItem } from '../../api/jobs';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

export default function JobFormPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const { data: existingJob, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id!),
    enabled: isEdit,
  });

  const [form, setForm] = useState({
    title: '', department: '', seniority_level: 'mid', employment_type: 'full-time',
    location: '', description: '',
    min_salary: '', max_salary: '', currency: 'RMB', benefits: '', status: 'open',
    target_score: '',
  });

  const [requirements, setRequirements] = useState<WeightedItem[]>([]);
  const [preferredSkills, setPreferredSkills] = useState<WeightedItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existingJob) {
      setForm({
        title: existingJob.title,
        department: existingJob.department,
        seniority_level: existingJob.seniority_level,
        employment_type: existingJob.employment_type,
        location: existingJob.location || '',
        description: existingJob.description,
        min_salary: existingJob.min_salary?.toString() || '',
        max_salary: existingJob.max_salary?.toString() || '',
        currency: existingJob.currency,
        benefits: existingJob.benefits?.join('\n') || '',
        status: existingJob.status,
        target_score: existingJob.target_score?.toString() || '',
      });
      // Handle both legacy string[] and new {text,weight}[] formats
      setRequirements(
        (existingJob.requirements as (string | WeightedItem)[] | null)?.map(r =>
          typeof r === 'string' ? { text: r, weight: 5 } : r
        ) || []
      );
      setPreferredSkills(
        (existingJob.preferred_skills as (string | WeightedItem)[] | null)?.map(r =>
          typeof r === 'string' ? { text: r, weight: 5 } : r
        ) || []
      );
    }
  }, [existingJob]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      isEdit ? jobsApi.update(id!, data) : jobsApi.create(data as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate('/jobs');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      requirements: requirements.filter(r => r.text.trim()).length > 0
        ? requirements.filter(r => r.text.trim())
        : null,
      preferred_skills: preferredSkills.filter(r => r.text.trim()).length > 0
        ? preferredSkills.filter(r => r.text.trim())
        : null,
      benefits: form.benefits ? form.benefits.split('\n').filter(Boolean) : null,
      min_salary: form.min_salary ? parseFloat(form.min_salary) : null,
      max_salary: form.max_salary ? parseFloat(form.max_salary) : null,
      location: form.location || null,
      target_score: form.target_score ? parseInt(form.target_score, 10) : null,
    };
    mutation.mutate(data);
  };

  const handleGenerate = async () => {
    if (!form.title || !form.department || !form.seniority_level || isGenerating) return;
    setIsGenerating(true);
    setForm(prev => ({ ...prev, description: '' }));

    try {
      for await (const event of streamGenerateDescription(
        form.title, form.department, form.seniority_level, form.employment_type, i18n.language
      )) {
        if (event.type === 'token' && event.content) {
          setForm(prev => ({ ...prev, description: prev.description + event.content! }));
        } else if (event.type === 'done' && event.result) {
          if (event.result.requirements?.length) setRequirements(event.result.requirements);
          if (event.result.preferred_skills?.length) setPreferredSkills(event.result.preferred_skills);
        }
      }
    } catch {
      // silently ignore network errors
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = !!form.title && !!form.department && !!form.seniority_level && !isGenerating;

  const handleExtractFromFile = async (file: File) => {
    setIsExtracting(true);
    setExtractError('');
    try {
      const data = await jobsApi.extractFromFile(file);
      setForm(prev => ({
        ...prev,
        title: (data.title as string) || prev.title,
        department: (data.department as string) || prev.department,
        seniority_level: (data.seniority_level as string) || prev.seniority_level,
        employment_type: (data.employment_type as string) || prev.employment_type,
        location: (data.location as string) || prev.location,
        description: (data.description as string) || prev.description,
        min_salary: data.min_salary != null ? String(data.min_salary) : prev.min_salary,
        max_salary: data.max_salary != null ? String(data.max_salary) : prev.max_salary,
        currency: (data.currency as string) || prev.currency,
        benefits: Array.isArray(data.benefits) ? (data.benefits as string[]).join('\n') : prev.benefits,
      }));
      if (Array.isArray(data.requirements) && (data.requirements as WeightedItem[]).length > 0) {
        setRequirements(data.requirements as WeightedItem[]);
      }
      if (Array.isArray(data.preferred_skills) && (data.preferred_skills as WeightedItem[]).length > 0) {
        setPreferredSkills(data.preferred_skills as WeightedItem[]);
      }
    } catch {
      setExtractError(t('jobs.form.uploadFileError'));
    } finally {
      setIsExtracting(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const inputClass = "w-full border border-slate-300/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/50 backdrop-blur-sm";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <AnimatedPage>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold gradient-text">{isEdit ? t('jobs.editTitle') : t('jobs.createTitle')}</h1>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleExtractFromFile(f); e.target.value = ''; }}
            />
            <motion.button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting}
              whileHover={{ scale: isExtracting ? 1 : 1.03 }}
              whileTap={{ scale: isExtracting ? 1 : 0.97 }}
              title={t('jobs.form.uploadFileHint')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white disabled:opacity-50 shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              {isExtracting ? t('jobs.form.uploading') : t('jobs.form.uploadFromFile')}
            </motion.button>
            {extractError && <p className="text-xs text-red-500 mt-1 text-right">{extractError}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('jobs.form.jobTitle')} *</label>
              <input className={inputClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>{t('jobs.form.department')} *</label>
              <input className={inputClass} value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>{t('jobs.form.seniorityLevel')} *</label>
              <select className={inputClass} value={form.seniority_level} onChange={e => setForm({ ...form, seniority_level: e.target.value })}>
                <option value="junior">{t('jobs.form.levels.junior')}</option>
                <option value="mid">{t('jobs.form.levels.mid')}</option>
                <option value="senior">{t('jobs.form.levels.senior')}</option>
                <option value="lead">{t('jobs.form.levels.lead')}</option>
                <option value="director">{t('jobs.form.levels.director')}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('jobs.form.employmentType')}</label>
              <select className={inputClass} value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
                <option value="full-time">{t('jobs.form.types.fullTime')}</option>
                <option value="part-time">{t('jobs.form.types.partTime')}</option>
                <option value="contract">{t('jobs.form.types.contract')}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('jobs.form.location')}</label>
              <input className={inputClass} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder={t('jobs.form.locationPlaceholder')} />
            </div>
          </div>

          {/* Description with AI generate button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">{t('jobs.form.description')} *</label>
              <motion.button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                whileHover={{ scale: canGenerate ? 1.03 : 1 }}
                whileTap={{ scale: canGenerate ? 0.97 : 1 }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 text-white disabled:opacity-40 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isGenerating ? t('jobs.form.generating') : t('jobs.form.generateWithAI')}
              </motion.button>
            </div>
            <textarea
              className={inputClass}
              rows={7}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              required
              placeholder={isGenerating ? t('jobs.form.generatingPlaceholder') : ''}
            />
          </div>

          {/* Weighted Requirements */}
          <WeightedList
            label={t('jobs.form.requirements')}
            items={requirements}
            onAdd={() => setRequirements(prev => [...prev, { text: '', weight: 5 }])}
            onRemove={i => setRequirements(prev => prev.filter((_, idx) => idx !== i))}
            onUpdate={(i, field, value) => setRequirements(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))}
            placeholder={t('jobs.form.requirementPlaceholder')}
            weightLabel={t('jobs.form.weight')}
            addLabel={t('jobs.form.addRequirement')}
          />

          {/* Weighted Preferred Skills */}
          <WeightedList
            label={t('jobs.form.preferredSkills')}
            items={preferredSkills}
            onAdd={() => setPreferredSkills(prev => [...prev, { text: '', weight: 5 }])}
            onRemove={i => setPreferredSkills(prev => prev.filter((_, idx) => idx !== i))}
            onUpdate={(i, field, value) => setPreferredSkills(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))}
            placeholder={t('jobs.form.skillPlaceholder')}
            weightLabel={t('jobs.form.weight')}
            addLabel={t('jobs.form.addSkill')}
          />

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>{t('jobs.form.minSalary')}</label>
              <input type="number" className={inputClass} value={form.min_salary} onChange={e => setForm({ ...form, min_salary: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>{t('jobs.form.maxSalary')}</label>
              <input type="number" className={inputClass} value={form.max_salary} onChange={e => setForm({ ...form, max_salary: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>{t('jobs.form.currency')}</label>
              <input className={inputClass} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>
                {t('jobs.form.targetScore')}
                <span className="ml-1 text-xs text-slate-400 font-normal">({t('common.optional')})</span>
              </label>
              <input
                type="number"
                min={0}
                max={100}
                className={inputClass}
                value={form.target_score}
                onChange={e => setForm({ ...form, target_score: e.target.value })}
                placeholder="0–100"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <motion.button
              type="submit"
              disabled={mutation.isPending}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 shadow-lg shadow-blue-500/25"
            >
              {mutation.isPending ? t('jobs.form.saving') : isEdit ? t('jobs.form.updateBtn') : t('jobs.form.createBtn')}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => navigate('/jobs')}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 px-6 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              {t('common.cancel')}
            </motion.button>
          </div>
        </form>
      </div>
    </AnimatedPage>
  );
}

interface WeightedListProps {
  label: string;
  items: WeightedItem[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: keyof WeightedItem, value: string | number) => void;
  placeholder: string;
  weightLabel: string;
  addLabel: string;
}

function WeightedList({ label, items, onAdd, onRemove, onUpdate, placeholder, weightLabel, addLabel }: WeightedListProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 border border-slate-300/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 backdrop-blur-sm"
              value={item.text}
              onChange={e => onUpdate(i, 'text', e.target.value)}
              placeholder={placeholder}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-500 w-14 text-right">{weightLabel} {item.weight}</span>
              <input
                type="range"
                min={1}
                max={10}
                value={item.weight}
                onChange={e => onUpdate(i, 'weight', parseInt(e.target.value, 10))}
                className="w-20 accent-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
              aria-label="Remove"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  );
}
