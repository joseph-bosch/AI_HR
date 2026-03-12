import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { jobsApi } from '../api/jobs';
import { candidatesApi } from '../api/candidates';

export interface DayPoint {
  label: string; // "Mon", "Tue", etc.
  date: string;  // ISO date
  count: number;
}

export interface StatusPoint {
  status: string;
  label: string;
  count: number;
  color: string;
}

export function useDashboardStats() {
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
  });

  const { data: allCandidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ['candidates', 'withArchived'],
    queryFn: () => candidatesApi.list({ include_archived: true }),
  });

  const candidates = allCandidates?.filter(c => !c.is_archived);
  const archivedCandidates = allCandidates?.filter(c => c.is_archived).length ?? 0;

  const openJobs = jobs?.filter(j => j.status === 'open') ?? [];

  const statsQueries = useQueries({
    queries: openJobs.map(job => ({
      queryKey: ['jobStats', job.id],
      queryFn: () => jobsApi.getStats(job.id),
      enabled: openJobs.length > 0,
    })),
  });

  const statsLoading = statsQueries.some(q => q.isLoading);
  const statsData = statsQueries
    .filter(q => q.isSuccess && q.data)
    .map(q => q.data!);

  let screenedCandidates = 0;
  let shortlistedCandidates = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const s of statsData) {
    screenedCandidates += s.screened_candidates;
    shortlistedCandidates += s.shortlisted_candidates;
    if (s.avg_score != null && s.total_candidates > 0) {
      scoreSum += s.avg_score * s.total_candidates;
      scoreCount += s.total_candidates;
    }
  }

  const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

  // Build candidate count by pipeline status
  // "new" and "screening" are merged into a single "screening" bar
  const statusConfig: { status: string; label: string; color: string }[] = [
    { status: 'screening',   label: 'Screening',   color: '#8b5cf6' },
    { status: 'shortlisted', label: 'Shortlisted', color: '#0ea5e9' },
    { status: 'interviewing',label: 'Interview',   color: '#f59e0b' },
    { status: 'offered',     label: 'Offered',     color: '#10b981' },
    { status: 'hired',       label: 'Hired',       color: '#059669' },
    { status: 'rejected',    label: 'Rejected',    color: '#ef4444' },
  ];

  const candidatesByStatus: StatusPoint[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of statusConfig) counts[s.status] = 0;
    if (candidates) {
      for (const c of candidates) {
        // Merge "new" candidates into the "screening" bar
        const mapped = c.status === 'new' ? 'screening' : c.status;
        if (counts[mapped] !== undefined) counts[mapped]++;
      }
    }
    return statusConfig.map(s => ({ ...s, count: counts[s.status] }));
  }, [candidates]);

  return {
    openJobs: openJobs.length,
    totalCandidates: candidates?.length ?? 0,
    archivedCandidates,
    screenedCandidates,
    shortlistedCandidates,
    avgScore,
    candidatesByStatus,
    isLoading: jobsLoading || candidatesLoading || statsLoading,
  };
}
