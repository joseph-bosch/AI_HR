import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Download, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { offersApi } from '../../api/offers';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

export default function OfferEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [content, setContent] = useState('');

  const { data: offer, isLoading, refetch } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => offersApi.get(id!),
  });

  useEffect(() => { if (offer) setContent(offer.content); }, [offer]);

  const saveMutation = useMutation({
    mutationFn: () => offersApi.update(id!, { content }),
    onSuccess: () => refetch(),
  });

  const approveMutation = useMutation({
    mutationFn: () => offersApi.approve(id!),
    onSuccess: () => refetch(),
  });

  const handleDownload = async () => {
    const blob = await offersApi.downloadPdf(id!);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offer_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <LoadingSpinner />;
  if (!offer) return <p className="text-red-500">{t('offers.notFound')}</p>;

  return (
    <AnimatedPage>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{t('offers.editTitle')}</h1>
            <span className={`inline-block mt-2 text-xs px-2.5 py-1 rounded-full font-medium text-white ${
              offer.status === 'approved' ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-yellow-400 to-amber-500'
            }`}>{offer.status}</span>
          </div>
          <div className="flex gap-3">
            {offer.status === 'approved' && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleDownload}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                <Download className="w-4 h-4" /> {t('offers.downloadPdf')}
              </motion.button>
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <textarea
            aria-label={t('offers.editTitle')}
            className="w-full border border-slate-300/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[500px] font-mono resize-y bg-white/50 backdrop-blur-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex gap-3 mt-4">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-gradient-to-r from-slate-400 to-slate-500 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              {saveMutation.isPending ? t('offers.saving') : t('offers.saveDraft')}
            </motion.button>
            {offer.status === 'draft' && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> {approveMutation.isPending ? t('offers.approving') : t('offers.approve')}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
