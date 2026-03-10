import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import Card3D from '../common/Card3D';
import AnimatedCounter from '../common/AnimatedCounter';
import ProgressRing from './ProgressRing';

interface StatCardProps {
  index: number;
  icon: ReactNode;
  label: string;
  value: number;
  subtitle: string;
  gradient: string;
  glow: string;
  ringValue?: number;
  ringColor?: string;
  suffix?: string;
}

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22, delay: i * 0.12 },
  }),
};

export default function StatCard({
  index,
  icon,
  label,
  value,
  subtitle,
  gradient,
  glow,
  ringValue,
  ringColor,
  suffix,
}: StatCardProps) {
  return (
    <motion.div variants={cardVariants} custom={index}>
      <Card3D glowColor={glow}>
        <div className="flex items-start justify-between gap-2">
          {/* left: icon + metric */}
          <div className="flex-1 min-w-0">
            <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${gradient} shadow mb-3`}>
              {icon}
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <div className="flex items-baseline gap-1">
              <AnimatedCounter value={value} className="text-2xl font-bold text-slate-900" />
              {suffix && <span className="text-lg font-bold text-slate-400">{suffix}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">{subtitle}</p>
          </div>

          {/* right: optional progress ring */}
          {ringValue != null && (
            <ProgressRing value={ringValue} color={ringColor} />
          )}
        </div>

        {/* bottom accent bar */}
        {ringValue != null && (
          <motion.div
            className="mt-3 h-1 rounded-full overflow-hidden bg-slate-100/60"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.12 + 0.3, duration: 0.4 }}
            style={{ transformOrigin: 'left' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: ringColor ?? '#6366f1' }}
              initial={{ width: '0%' }}
              whileInView={{ width: `${ringValue}%` }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.12 + 0.6, duration: 0.6, ease: 'easeOut' }}
            />
          </motion.div>
        )}
      </Card3D>
    </motion.div>
  );
}
