interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const color =
    score >= 85 ? 'bg-green-100 text-green-800 border-green-300' :
    score >= 70 ? 'bg-blue-100 text-blue-800 border-blue-300' :
    score >= 50 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
    'bg-red-100 text-red-800 border-red-300';

  const glowShadow =
    score >= 85 ? '0 0 12px rgba(16, 185, 129, 0.4)' :
    score >= 70 ? '0 0 12px rgba(59, 130, 246, 0.4)' :
    score >= 50 ? '0 0 12px rgba(234, 179, 8, 0.4)' :
    '0 0 12px rgba(239, 68, 68, 0.4)';

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-lg px-4 py-2 font-bold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${color} ${sizeClasses[size]}`}
      style={{ boxShadow: glowShadow }}
    >
      {score.toFixed(0)}
    </span>
  );
}
