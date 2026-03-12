import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { jobsApi } from '../../api/jobs';
import { candidatesApi } from '../../api/candidates';
import { offersApi, templatesApi } from '../../api/offers';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

export default function OfferGeneratePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [jobId, setJobId] = useState(searchParams.get('job_id') || searchParams.get('jobId') || '');
  const [candidateId, setCandidateId] = useState(searchParams.get('candidate_id') || '');
  const [templateId, setTemplateId] = useState('');
  const [offerData, setOfferData] = useState({
    salary: '', start_date: '', benefits: '', signing_bonus: '', manager_name: '',
  });

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list() });
  const { data: candidates } = useQuery({ queryKey: ['candidates'], queryFn: () => candidatesApi.list() });
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: () => templatesApi.list() });

  const mutation = useMutation({
    mutationFn: () => offersApi.generate({
      job_id: jobId, candidate_id: candidateId, template_id: templateId,
      offer_data: Object.fromEntries(Object.entries(offerData).filter(([_, v]) => v)),
      language: i18n.language,
    }),
    onSuccess: (data) => navigate(`/offers/${data.id}/edit`),
  });

  const inputClass = "w-full border border-slate-300/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white/50 backdrop-blur-sm";

  return (
    <AnimatedPage>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold gradient-text mb-6">{t('offers.generateTitle')}</h1>

        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="offer-job" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.job')} *</label>
              <select id="offer-job" className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}>
                <option value="">{t('offers.fields.selectJob')}</option>
                {jobs?.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="offer-candidate" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.candidate')} *</label>
              <select id="offer-candidate" className={inputClass} value={candidateId} onChange={e => setCandidateId(e.target.value)}>
                <option value="">{t('offers.fields.selectCandidate')}</option>
                {candidates?.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}` : c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="offer-template" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.template')} *</label>
            <select id="offer-template" className={inputClass} value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">{t('offers.fields.selectTemplate')}</option>
              {templates?.map(tmpl => <option key={tmpl.id} value={tmpl.id}>{tmpl.name} {tmpl.department ? `(${tmpl.department})` : ''}</option>)}
            </select>
          </div>

          <hr className="border-slate-200/50" />
          <h3 className="text-sm font-semibold text-slate-900">{t('offers.offerDetails')}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="offer-salary" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.salary')}</label>
              <input id="offer-salary" className={inputClass} value={offerData.salary} onChange={e => setOfferData({ ...offerData, salary: e.target.value })} placeholder={t('offers.fields.salaryPlaceholder')} />
            </div>
            <div>
              <label htmlFor="offer-start-date" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.startDate')}</label>
              <input id="offer-start-date" type="date" aria-label={t('offers.fields.startDate')} className={inputClass} value={offerData.start_date} onChange={e => setOfferData({ ...offerData, start_date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="offer-benefits" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.benefits')}</label>
              <input id="offer-benefits" className={inputClass} value={offerData.benefits} onChange={e => setOfferData({ ...offerData, benefits: e.target.value })} placeholder={t('offers.fields.benefitsPlaceholder')} />
            </div>
            <div>
              <label htmlFor="offer-manager" className="block text-sm font-medium text-slate-700 mb-1">{t('offers.fields.managerName')}</label>
              <input id="offer-manager" aria-label={t('offers.fields.managerName')} className={inputClass} value={offerData.manager_name} onChange={e => setOfferData({ ...offerData, manager_name: e.target.value })} />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => mutation.mutate()}
            disabled={!jobId || !candidateId || !templateId || mutation.isPending}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? t('offers.generating') : t('offers.generateBtn')}
          </motion.button>
        </div>
      </div>
    </AnimatedPage>
  );
}
