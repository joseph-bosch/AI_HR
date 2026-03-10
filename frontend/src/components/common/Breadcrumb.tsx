import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { jobsApi } from '../../api/jobs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONNECTOR_SEGMENTS = new Set(['job', 'candidate']);
const UUID_ABSORB_PARENTS = new Set(['evaluate', 'report']);

type Crumb = { label: string; href: string };

function CrumbNav({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length <= 1) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm mb-6">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <div key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
            {isLast ? (
              <span className="font-medium text-slate-700">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.href}
                className="text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                {i === 0 ? <Home className="w-4 h-4" /> : crumb.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function Breadcrumb() {
  const { t } = useTranslation();
  const location = useLocation();
  const { pathname, state } = location;
  const segments = pathname.split('/').filter(Boolean);

  const LABELS: Record<string, string> = {
    jobs: t('breadcrumb.jobs'),
    new: t('breadcrumb.newJob'),
    edit: t('breadcrumb.edit'),
    screening: t('breadcrumb.screening'),
    interviews: t('breadcrumb.evaluations'),
    evaluate: t('breadcrumb.evaluation'),
    report: t('breadcrumb.report'),
    offers: t('breadcrumb.offers'),
    generate: t('breadcrumb.generate'),
    templates: t('breadcrumb.templates'),
    questions: t('breadcrumb.questions'),
  };

  const jobIdFromUrl = segments.find((seg, i) => {
    if (!UUID_RE.test(seg)) return false;
    const prev = segments[i - 1];
    return prev === 'jobs' || prev === 'job';
  }) ?? null;
  const jobIdFromState = (state as { jobId?: string } | null)?.jobId ?? null;
  const jobId = jobIdFromUrl ?? jobIdFromState;

  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.get(jobId!),
    enabled: !!jobId,
    staleTime: 60_000,
  });

  if (
    segments[0] === 'screening' &&
    segments[1] === 'job' &&
    segments[2] && UUID_RE.test(segments[2])
  ) {
    const jId = segments[2];
    return (
      <CrumbNav crumbs={[
        { label: t('breadcrumb.home'), href: '/' },
        { label: t('breadcrumb.jobs'), href: '/jobs' },
        { label: job?.title ?? t('breadcrumb.job'), href: `/jobs/${jId}` },
        { label: t('breadcrumb.screening'), href: pathname },
      ]} />
    );
  }

  if (
    segments[0] === 'screening' &&
    segments[1] === 'candidate' &&
    segments[2] && UUID_RE.test(segments[2])
  ) {
    const crumbs: Crumb[] = [{ label: t('breadcrumb.home'), href: '/' }];
    if (jobIdFromState) {
      crumbs.push({ label: t('breadcrumb.jobs'), href: '/jobs' });
      crumbs.push({ label: job?.title ?? t('breadcrumb.job'), href: `/jobs/${jobIdFromState}` });
      crumbs.push({ label: t('breadcrumb.screening'), href: `/screening/job/${jobIdFromState}` });
    } else {
      crumbs.push({ label: t('breadcrumb.screening'), href: '/screening' });
    }
    crumbs.push({ label: t('breadcrumb.candidateProfile'), href: pathname });
    return <CrumbNav crumbs={crumbs} />;
  }

  const crumbs: Crumb[] = [{ label: t('breadcrumb.home'), href: '/' }];
  let path = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    path += '/' + seg;

    if (CONNECTOR_SEGMENTS.has(seg)) continue;

    if (UUID_RE.test(seg)) {
      const prev = segments[i - 1];
      if (UUID_ABSORB_PARENTS.has(prev)) continue;

      let label: string;
      if (prev === 'jobs' || prev === 'job') label = job?.title ?? t('breadcrumb.job');
      else if (prev === 'candidate') label = t('breadcrumb.candidateProfile');
      else if (prev === 'templates') label = t('breadcrumb.template');
      else if (prev === 'questions') label = t('breadcrumb.questionSet');
      else if (prev === 'offers') label = t('breadcrumb.offer');
      else label = '…';

      crumbs.push({ label, href: path });
    } else {
      const label = LABELS[seg];
      if (label) crumbs.push({ label, href: path });
    }
  }

  return <CrumbNav crumbs={crumbs} />;
}
