import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
      <p className="text-sm text-slate-500">{message}</p>
      <div
        className="shimmer mt-3 h-1.5 w-32 rounded-full"
        style={{
          background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #6366f1 100%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );
}
