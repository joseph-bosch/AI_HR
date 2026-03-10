import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, SkipForward, X, Mail } from 'lucide-react';
import { jobsApi } from '../../api/jobs';
import { candidatesApi } from '../../api/candidates';
import type { DuplicateInfo, EmailPreview, ConfirmEmailRequest } from '../../api/candidates';
import { screeningApi } from '../../api/screening';
import type { Resume } from '../../types/candidate';
import FileUpload from '../../components/common/FileUpload';
import AnimatedPage from '../../components/common/AnimatedPage';
import Card3D from '../../components/common/Card3D';
import { useTranslation } from 'react-i18next';

export default function ScreeningPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [uploadedCandidateIds, setUploadedCandidateIds] = useState<string[]>([]);

  // Email upload state
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailForm, setEmailForm] = useState<ConfirmEmailRequest>({ preview_id: '', first_name: '', last_name: '', email: '', phone: '', notes: '' });
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailError, setEmailError] = useState('');

  const uploadEmailMutation = useMutation({
    mutationFn: (file: File) => candidatesApi.uploadEmail(file),
    onSuccess: (data) => {
      setEmailPreview(data);
      setEmailForm({
        preview_id: data.preview_id,
        first_name: data.extracted_info.first_name ?? '',
        last_name: data.extracted_info.last_name ?? '',
        email: data.extracted_info.email ?? '',
        phone: data.extracted_info.phone ?? '',
        notes: data.extracted_info.notes ?? '',
      });
      setEmailError('');
      setShowEmailModal(true);
    },
    onError: () => setEmailError(t('screening.emailModal.error')),
  });

  const confirmEmailMutation = useMutation({
    mutationFn: () => candidatesApi.confirmEmail(emailForm),
    onSuccess: (candidate) => {
      setUploadedCandidateIds(prev => [...prev, candidate.id]);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      setShowEmailModal(false);
      setEmailPreview(null);
    },
    onError: () => setEmailError(t('screening.emailModal.error')),
  });

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [duplicateChoices, setDuplicateChoices] = useState<Record<string, 'skip' | 'replace'>>({});
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isResolvingDuplicates, setIsResolvingDuplicates] = useState(false);

  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: () => jobsApi.list({ status: 'open' }) });

  // Poll parse status of recently uploaded candidates
  const { data: parseStatuses } = useQuery({
    queryKey: ['parse-statuses', uploadedCandidateIds],
    queryFn: () => Promise.all(uploadedCandidateIds.map(id => candidatesApi.getResume(id))),
    enabled: uploadedCandidateIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as Resume[] | undefined;
      if (!data) return 3000;
      const allDone = data.every(r => r.parse_status === 'completed' || r.parse_status === 'failed');
      return allDone ? false : 3000;
    },
  });

  const parsedCount = parseStatuses?.filter(r => r.parse_status === 'completed' || r.parse_status === 'failed').length ?? 0;
  const allParsed = uploadedCandidateIds.length === 0 || parsedCount >= uploadedCandidateIds.length;

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) =>
      files.length === 1
        ? candidatesApi.uploadResume(files[0])
        : candidatesApi.uploadBulk(files),
    onSuccess: (data: any) => {
      const ids: string[] = data.candidates
        ? data.candidates.map((c: { id: string }) => c.id)
        : [data.id];
      setUploadedCandidateIds(ids);
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
  });

  const scoreMutation = useMutation({
    mutationFn: () => screeningApi.scoreBatch(selectedJobId, i18n.language),
    onSuccess: () => navigate(`/screening/job/${selectedJobId}`),
  });

  const handleRunScreening = async () => {
    if (!canRunScreening) return;

    // Only check duplicates if files were just uploaded and a job is selected
    if (uploadedCandidateIds.length > 0 && selectedJobId) {
      setIsCheckingDuplicates(true);
      try {
        const result = await candidatesApi.checkDuplicates(selectedJobId, uploadedCandidateIds);
        if (result.duplicates.length > 0) {
          setDuplicates(result.duplicates);
          // Default all choices to "skip"
          const choices: Record<string, 'skip' | 'replace'> = {};
          result.duplicates.forEach(d => { choices[d.new_candidate_id] = 'skip'; });
          setDuplicateChoices(choices);
          setShowDuplicateModal(true);
          return;
        }
      } catch {
        // If check fails (e.g. network error), proceed with scoring anyway
      } finally {
        setIsCheckingDuplicates(false);
      }
    }

    scoreMutation.mutate();
  };

  const handleConfirmDuplicates = async () => {
    setIsResolvingDuplicates(true);
    const resolvedIds: string[] = [];
    try {
      for (const dup of duplicates) {
        const action = duplicateChoices[dup.new_candidate_id] ?? 'skip';
        await candidatesApi.resolveDuplicate({
          new_candidate_id: dup.new_candidate_id,
          existing_candidate_id: dup.existing_candidate_id,
          job_id: selectedJobId,
          action,
        });
        resolvedIds.push(dup.new_candidate_id);
      }
    } finally {
      setIsResolvingDuplicates(false);
      setShowDuplicateModal(false);
      // Remove resolved (deleted) candidates from tracking
      setUploadedCandidateIds(prev => prev.filter(id => !resolvedIds.includes(id)));
      setDuplicates([]);
    }
    scoreMutation.mutate();
  };

  const isParsing = uploadedCandidateIds.length > 0 && !allParsed;
  const canRunScreening = !!selectedJobId && !scoreMutation.isPending && !isParsing && !isCheckingDuplicates;

  return (
    <AnimatedPage>
      <div>
        <h1 className="text-3xl font-bold gradient-text mb-6">{t('screening.title')}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card3D glowColor="rgba(59, 130, 246, 0.3)">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('screening.uploadStep')}</h2>
              <FileUpload
                multiple
                onFilesSelected={(files) => uploadMutation.mutate(files)}
                uploading={uploadMutation.isPending}
              />
              {/* Email import */}
              <div className="mt-3">
                <input
                  ref={emailInputRef}
                  type="file"
                  accept=".eml,.msg"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadEmailMutation.mutate(f); e.target.value = ''; }}
                />
                <button
                  type="button"
                  onClick={() => emailInputRef.current?.click()}
                  disabled={uploadEmailMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300/60 bg-white/50 text-slate-600 hover:bg-white/80 disabled:opacity-50 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-blue-500" />
                  {uploadEmailMutation.isPending ? t('common.loading') : t('screening.uploadEmail')}
                </button>
                {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
              </div>
              {uploadMutation.isPending && (
                <p className="text-sm text-blue-600 mt-2">{t('screening.uploading')}</p>
              )}
              {isParsing && (
                <div className="flex items-center gap-2 mt-2">
                  <svg className="w-4 h-4 animate-spin text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <p className="text-sm text-amber-600">
                    {t('screening.parsing', { done: parsedCount, total: uploadedCandidateIds.length })}
                  </p>
                </div>
              )}
              {allParsed && uploadedCandidateIds.length > 0 && (
                <p className="text-sm text-green-600 mt-2">
                  {t('screening.allParsed', { count: uploadedCandidateIds.length })}
                </p>
              )}
              {uploadMutation.isError && (
                <p className="text-sm text-red-600 mt-2">{t('screening.uploadFailed')}</p>
              )}
            </div>
          </Card3D>

          <Card3D glowColor="rgba(99, 102, 241, 0.3)">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('screening.screenStep')}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('screening.selectJob')}</label>
                  <select
                    className="w-full border border-slate-300/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 backdrop-blur-sm"
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                  >
                    <option value="">{t('screening.chooseJob')}</option>
                    {jobs?.map(job => (
                      <option key={job.id} value={job.id}>{job.title} ({job.department})</option>
                    ))}
                  </select>
                </div>
                {isParsing && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {t('screening.waitingForParsing')}
                  </p>
                )}
                <motion.button
                  onClick={handleRunScreening}
                  disabled={!canRunScreening}
                  whileHover={{ scale: canRunScreening ? 1.03 : 1 }}
                  whileTap={{ scale: canRunScreening ? 0.97 : 1 }}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 shadow-lg shadow-blue-500/25"
                >
                  {scoreMutation.isPending
                    ? t('screening.starting')
                    : isParsing
                    ? t('screening.waitingParsing')
                    : isCheckingDuplicates
                    ? t('screening.checkingDuplicates')
                    : t('screening.runScreening')}
                </motion.button>
                {selectedJobId && (
                  <motion.button
                    onClick={() => navigate(`/screening/job/${selectedJobId}`)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    {t('screening.viewRankings')}
                  </motion.button>
                )}
              </div>
            </div>
          </Card3D>
        </div>
      </div>

      {/* Email review modal */}
      <AnimatePresence>
        {showEmailModal && emailPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-500" />
                  {t('screening.emailModal.title')}
                </h2>
                <button type="button" aria-label={t('common.cancel')} onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">{t('screening.emailModal.subtitle')}</p>

              {/* Email metadata */}
              <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1">
                <p className="text-xs text-slate-500"><span className="font-medium">{t('screening.emailModal.emailFrom')}:</span> {emailPreview.sender}</p>
                {emailPreview.subject && <p className="text-xs text-slate-500"><span className="font-medium">{t('screening.emailModal.emailSubject')}:</span> {emailPreview.subject}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  {emailPreview.has_attachment
                    ? t('screening.emailModal.hasAttachment', { filename: emailPreview.attachment_filename })
                    : t('screening.emailModal.noAttachment')}
                </p>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {(['first_name', 'last_name'] as const).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {t(`screening.emailModal.${field === 'first_name' ? 'firstName' : 'lastName'}`)}
                    </label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={emailForm[field]}
                      onChange={e => setEmailForm(prev => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('screening.emailModal.emailField')}</label>
                  <input
                    type="email"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={emailForm.email}
                    onChange={e => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{t('screening.emailModal.phone')}</label>
                  <input
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={emailForm.phone}
                    onChange={e => setEmailForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('screening.emailModal.notes')}</label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
                  value={emailForm.notes}
                  onChange={e => setEmailForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Email body preview */}
              {emailPreview.email_body_preview && (
                <details className="mb-4">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">{t('screening.emailModal.emailBody')}</summary>
                  <pre className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">{emailPreview.email_body_preview}</pre>
                </details>
              )}

              {emailError && <p className="text-xs text-red-500 mb-3">{emailError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <motion.button
                  type="button"
                  onClick={() => confirmEmailMutation.mutate()}
                  disabled={confirmEmailMutation.isPending || !emailForm.first_name || !emailForm.last_name}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-1.5 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {confirmEmailMutation.isPending ? t('screening.emailModal.adding') : t('screening.emailModal.confirm')}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Duplicate detection modal */}
      <AnimatePresence>
        {showDuplicateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-amber-500" />
                  {t('screening.duplicateModal.title')}
                </h2>
                <button type="button" aria-label={t('common.cancel')} onClick={() => setShowDuplicateModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">{t('screening.duplicateModal.subtitle')}</p>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {duplicates.map(dup => (
                  <div key={dup.new_candidate_id} className="border border-slate-200 rounded-xl p-3">
                    <p className="text-sm font-medium text-slate-800 mb-1">{dup.new_candidate_name}</p>
                    <p className="text-xs text-slate-500 mb-3">
                      {t('screening.duplicateModal.existingScore', { name: dup.existing_candidate_name })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDuplicateChoices(prev => ({ ...prev, [dup.new_candidate_id]: 'skip' }))}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                          duplicateChoices[dup.new_candidate_id] === 'skip'
                            ? 'bg-slate-700 border-slate-700 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <SkipForward className="w-3 h-3" />
                        {t('screening.duplicateModal.skip')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDuplicateChoices(prev => ({ ...prev, [dup.new_candidate_id]: 'replace' }))}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                          duplicateChoices[dup.new_candidate_id] === 'replace'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Copy className="w-3 h-3" />
                        {t('screening.duplicateModal.replace')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className="px-4 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <motion.button
                  type="button"
                  onClick={handleConfirmDuplicates}
                  disabled={isResolvingDuplicates}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-1.5 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {isResolvingDuplicates ? t('common.saving') : t('screening.duplicateModal.confirm')}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}
