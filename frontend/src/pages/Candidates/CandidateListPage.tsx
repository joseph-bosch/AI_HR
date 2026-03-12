import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Trash2, Archive, ArchiveRestore, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { candidatesApi } from '../../api/candidates';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

const STATUS_COLORS: Record<string, string> = {
  new: 'from-blue-400 to-blue-500',
  screening: 'from-purple-400 to-purple-500',
  shortlisted: 'from-indigo-400 to-indigo-500',
  interviewing: 'from-amber-400 to-amber-500',
  offered: 'from-cyan-400 to-cyan-500',
  hired: 'from-green-400 to-green-500',
  rejected: 'from-red-400 to-red-500',
};

export default function CandidateListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['candidates', debouncedSearch, showArchived],
    queryFn: () => candidatesApi.list({
      search: debouncedSearch || undefined,
      include_archived: showArchived || undefined,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      setConfirmDeleteId(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.unarchive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });

  if (isLoading) return <LoadingSpinner />;

  const candidateName = (c: { first_name: string | null; last_name: string | null }) =>
    [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';

  return (
    <AnimatedPage>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold gradient-text">{t('candidates.title')}</h1>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-4 mb-5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t('candidates.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 border border-slate-300/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/50 backdrop-blur-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
            />
            {t('candidates.showArchived')}
          </label>
        </div>

        {/* Table */}
        {!candidates?.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('candidates.noCandidates')}</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-200/50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.name')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.email')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.phone')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.status')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.source')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.created')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">{t('candidates.columns.actions')}</th>
                </tr>
              </thead>
              <motion.tbody
                className="divide-y divide-slate-100/50"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {candidates.map(candidate => (
                  <motion.tr
                    key={candidate.id}
                    variants={itemVariants}
                    className={`hover:bg-indigo-50/50 transition-colors ${candidate.is_archived ? 'opacity-60' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium">
                      <Link to={`/screening/candidate/${candidate.id}`} state={{ from: 'candidates' }} className="text-blue-600 hover:underline">
                        {candidateName(candidate)}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{candidate.email || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{candidate.phone || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-3 py-1 rounded-full font-medium text-white bg-gradient-to-r ${STATUS_COLORS[candidate.status] ?? 'from-slate-400 to-slate-500'}`}>
                          {candidate.status}
                        </span>
                        {candidate.is_archived && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-200 text-slate-600">
                            {t('candidates.archived')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 capitalize">{candidate.source || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(candidate.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {/* Archive / Unarchive */}
                        {candidate.is_archived ? (
                          <button
                            type="button"
                            title={t('candidates.unarchive')}
                            onClick={() => unarchiveMutation.mutate(candidate.id)}
                            disabled={unarchiveMutation.isPending}
                            className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                          >
                            <ArchiveRestore className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title={t('candidates.archive')}
                            onClick={() => archiveMutation.mutate(candidate.id)}
                            disabled={archiveMutation.isPending}
                            className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors disabled:opacity-50"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete with inline confirm */}
                        {confirmDeleteId === candidate.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(candidate.id)}
                              disabled={deleteMutation.isPending}
                              className="text-xs bg-red-500 text-white px-2 py-1 rounded font-medium hover:bg-red-600 disabled:opacity-50"
                            >
                              {t('common.confirm')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium hover:bg-slate-300"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            title={t('common.delete')}
                            onClick={() => setConfirmDeleteId(candidate.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
