import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Star, AlertTriangle, Users } from 'lucide-react';
import { candidatesApi } from '../../api/candidates';
import { screeningApi } from '../../api/screening';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

export default function CandidateDetailPage() {
  const { t, i18n } = useTranslation();
  const { candidateId } = useParams<{ candidateId: string }>();
  const location = useLocation();
  const jobId = (location.state as { jobId?: string } | null)?.jobId;

  const { data: candidate, isLoading: loadingCandidate } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => candidatesApi.get(candidateId!),
  });

  const { data: resume, isLoading: loadingResume } = useQuery({
    queryKey: ['resume', candidateId],
    queryFn: () => candidatesApi.getResume(candidateId!),
    refetchInterval: (query) => query.state.data?.parse_status === 'pending' || query.state.data?.parse_status === 'processing' ? 3000 : false,
  });

  const { data: score } = useQuery({
    queryKey: ['candidate-score', candidateId, jobId],
    queryFn: () => screeningApi.getScoreByCandidate(candidateId!, jobId),
    enabled: !!candidateId,
    retry: false,
  });

  if (loadingCandidate || loadingResume) return <LoadingSpinner />;
  if (!candidate) return <p className="text-red-500">{t('screening.candidateProfile.notFound')}</p>;

  const parsed = resume?.parsed_data;
  const insights = score?.additional_insights;

  // Use translated content when the UI language differs from the content's primary language
  const lang = i18n.language;
  const resumeLang = resume?.primary_language || 'en';
  const resumeTranslation = (lang !== resumeLang && resume?.parsed_translations?.[lang]) || null;
  const summaryText = resumeTranslation?.summary || parsed?.summary;
  const displaySkills = resumeTranslation?.skills || parsed?.skills;
  const displayExperience = parsed?.experience?.map((exp, i) => ({
    ...exp,
    title: resumeTranslation?.experience?.[i]?.title || exp.title,
    company: resumeTranslation?.experience?.[i]?.company || exp.company,
    description: resumeTranslation?.experience?.[i]?.description || exp.description,
  }));
  const displayEducation = parsed?.education?.map((edu, i) => ({
    ...edu,
    degree: resumeTranslation?.education?.[i]?.degree || edu.degree,
    field: resumeTranslation?.education?.[i]?.field || edu.field,
    institution: resumeTranslation?.education?.[i]?.institution || edu.institution,
  }));

  // Screening score translations (includes additional_insights)
  const scoreLang = score?.primary_language || 'en';
  const scoreTranslation = (lang !== scoreLang && score?.score_translations?.[lang]) || null;
  const displayInsights = scoreTranslation?.additional_insights || insights;

  return (
    <AnimatedPage>
      <div>
        <h1 className="text-3xl font-bold gradient-text mb-1">
          {candidate.first_name || candidate.last_name
            ? `${candidate.first_name || ''} ${candidate.last_name || ''}`
            : 'Unknown Candidate'}
        </h1>
        <p className="text-slate-500 mb-6">
          {candidate.email && <span>{candidate.email}</span>}
          {candidate.phone && <span> &middot; {candidate.phone}</span>}
        </p>

        {resume?.parse_status === 'processing' && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 mb-6 animate-pulse">
            {t('screening.candidateProfile.parsing')}
          </div>
        )}

        {resume?.parse_status === 'failed' && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
            {t('screening.candidateProfile.parseFailed')} {resume.parse_error}
          </div>
        )}

        {parsed && (
          <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {summaryText && (
              <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">{t('screening.candidateProfile.summary')}</h2>
                <p className="text-sm text-slate-600">{summaryText}</p>
              </motion.div>
            )}

            {/* AI Insights card */}
            {displayInsights && (
              <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6 border border-violet-200/60 bg-gradient-to-br from-violet-50/30 to-indigo-50/20">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  <h2 className="text-lg font-semibold text-slate-900">{t('screening.candidateProfile.aiInsights')}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {displayInsights.career_trajectory && (
                    <div className="flex gap-3">
                      <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('screening.candidateProfile.insights.careerTrajectory')}</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{displayInsights.career_trajectory}</p>
                      </div>
                    </div>
                  )}
                  {displayInsights.cultural_indicators && (
                    <div className="flex gap-3">
                      <Users className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('screening.candidateProfile.insights.culturalIndicators')}</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{displayInsights.cultural_indicators}</p>
                      </div>
                    </div>
                  )}
                  {displayInsights.standout_qualities?.length ? (
                    <div className="flex gap-3">
                      <Star className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('screening.candidateProfile.insights.standoutQualities')}</p>
                        <ul className="space-y-1">
                          {displayInsights.standout_qualities.map((q: string, i: number) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-1.5 leading-relaxed">
                              <span className="text-amber-400 shrink-0">•</span>{q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                  {displayInsights.risk_flags?.length ? (
                    <div className="flex gap-3">
                      <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('screening.candidateProfile.insights.riskFlags')}</p>
                        <ul className="space-y-1">
                          {displayInsights.risk_flags.map((f: string, i: number) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-1.5 leading-relaxed">
                              <span className="text-orange-400 shrink-0">•</span>{f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}

            {displaySkills?.length ? (
              <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">{t('screening.candidateProfile.skills')}</h2>
                <div className="flex flex-wrap gap-2">
                  {displaySkills.map((skill, i) => (
                    <span key={i} className="bg-gradient-to-r from-blue-400 to-blue-500 text-white text-xs px-3 py-1 rounded-full font-medium">{skill}</span>
                  ))}
                </div>
              </motion.div>
            ) : null}

            {displayExperience?.length ? (
              <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">{t('screening.candidateProfile.experience')}</h2>
                <div className="space-y-4">
                  {displayExperience.map((exp, i) => (
                    <div key={i} className="border-l-2 border-blue-300 pl-4">
                      <p className="font-medium text-slate-900">{exp.title}</p>
                      <p className="text-sm text-slate-500">{exp.company} &middot; {exp.start_date} - {exp.end_date}</p>
                      <p className="text-sm text-slate-600 mt-1">{exp.description}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : null}

            {displayEducation?.length ? (
              <motion.div variants={itemVariants} className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">{t('screening.candidateProfile.education')}</h2>
                {displayEducation.map((edu, i) => (
                  <div key={i} className="mb-2">
                    <p className="font-medium text-slate-900">{edu.degree} in {edu.field}</p>
                    <p className="text-sm text-slate-500">{edu.institution} {edu.year ? `(${edu.year})` : ''}</p>
                  </div>
                ))}
              </motion.div>
            ) : null}
          </motion.div>
        )}
      </div>
    </AnimatedPage>
  );
}
