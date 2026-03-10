import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, CheckCircle, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import AnimatedCounter from '../common/AnimatedCounter';

/* ------------------------------------------------------------------ */
/*  Chart dimensions                                                   */
/* ------------------------------------------------------------------ */
const W = 700;
const H = 220;
const PAD = { top: 20, right: 20, bottom: 36, left: 36 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function DashboardStatsPanel() {
  const { t } = useTranslation();
  const {
    openJobs,
    totalCandidates,
    screenedCandidates,
    shortlistedCandidates,
    candidatesByStatus,
    isLoading,
  } = useDashboardStats();

  const [inView, setInView] = useState(false);
  useEffect(() => { setInView(true); }, []);

  if (isLoading) return null;

  const maxY = Math.max(...candidatesByStatus.map(s => s.count), 1);
  const niceMax = Math.ceil(maxY / (maxY > 8 ? 5 : 2)) * (maxY > 8 ? 5 : 2);
  const step = niceMax > 8 ? 5 : niceMax > 4 ? 2 : 1;
  const gridLines: number[] = [];
  for (let v = 0; v <= niceMax; v += step) gridLines.push(v);

  const n = candidatesByStatus.length;
  const groupW = chartW / n;
  const barW = groupW * 0.55;

  const miniStats = [
    { icon: Briefcase, label: t('dashboard.stats.openJobs'), value: openJobs, color: '#6366f1' },
    { icon: Users, label: t('dashboard.stats.candidates'), value: totalCandidates, color: '#8b5cf6' },
    { icon: CheckCircle, label: t('dashboard.stats.screened'), value: screenedCandidates, color: '#06b6d4' },
    { icon: TrendingUp, label: t('dashboard.stats.shortlisted'), value: shortlistedCandidates, color: '#10b981' },
  ];

  return (
    <motion.div
      className="mb-8 mt-2"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <div className="glass-card rounded-2xl p-6 overflow-hidden">
        {/* Header row: title + mini stats */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              {t('dashboard.stats.candidateActivity')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{t('dashboard.stats.byStatus')}</p>
          </div>
          <div className="flex gap-5">
            {miniStats.map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
                <div className="text-right">
                  <AnimatedCounter value={s.value} className="text-lg font-bold text-slate-800" />
                  <p className="text-[10px] text-slate-400 leading-none">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SVG Bar Chart */}
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
          <defs>
            {candidatesByStatus.map(s => (
              <linearGradient key={`grad-${s.status}`} id={`grad-${s.status}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.5" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal grid lines */}
          {gridLines.map(v => {
            const y = PAD.top + chartH - (v / niceMax) * chartH;
            return (
              <g key={v}>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={y} y2={y}
                  stroke="#e2e8f0" strokeWidth="0.7" strokeDasharray="4 3"
                />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
                  {v}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {candidatesByStatus.map((s, i) => {
            const cx = PAD.left + i * groupW + groupW / 2;
            const bH = Math.max((s.count / niceMax) * chartH, s.count > 0 ? 4 : 0);
            const barX = cx - barW / 2;
            const barY = PAD.top + chartH - bH;

            return (
              <g key={s.status}>
                <motion.rect
                  x={barX}
                  width={barW}
                  rx={4}
                  fill={`url(#grad-${s.status})`}
                  initial={{ y: PAD.top + chartH, height: 0 }}
                  animate={inView ? { y: barY, height: bH } : {}}
                  transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 260, damping: 22 }}
                />

                {s.count > 0 && (
                  <motion.text
                    x={cx}
                    y={barY - 6}
                    textAnchor="middle"
                    style={{ fontSize: 11, fontWeight: 700, fill: s.color }}
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ delay: 0.3 + i * 0.07 }}
                  >
                    {s.count}
                  </motion.text>
                )}

                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: 10, fontWeight: 500 }}
                >
                  {t(`dashboard.stats.status.${s.status}`, { defaultValue: s.label })}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </motion.div>
  );
}
