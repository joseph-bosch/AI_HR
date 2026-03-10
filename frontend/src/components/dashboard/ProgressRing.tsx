import { useRef } from 'react';
import { motion, useSpring, useTransform, useInView } from 'framer-motion';

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export default function ProgressRing({
  value,
  size = 52,
  strokeWidth = 5,
  color = '#6366f1',
}: ProgressRingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const springValue = useSpring(0, { stiffness: 60, damping: 20 });
  const offset = useTransform(springValue, v => circumference - (v / 100) * circumference);

  if (inView) springValue.set(value);

  return (
    <svg ref={ref} width={size} height={size} className="shrink-0">
      {/* background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-slate-200/60"
        strokeWidth={strokeWidth}
      />
      {/* animated arc */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        style={{ strokeDashoffset: offset }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {/* center value text */}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-slate-600"
        style={{ fontSize: size * 0.24, fontWeight: 700 }}
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}
