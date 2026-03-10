import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, Upload, Mic, MicOff, FileAudio, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { interviewsApi } from '../../api/interviews';
import type { Evaluation } from '../../types/interview';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import { useTranslation } from 'react-i18next';

type Mode = 'qa' | 'audio';

export default function EvaluationFlowPage() {
  const { t, i18n } = useTranslation();
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('qa');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');

  const { data: evaluation, isLoading, refetch } = useQuery({
    queryKey: ['evaluation', evalId],
    queryFn: () => interviewsApi.getEvaluation(evalId!),
  });

  const answerMutation = useMutation({
    mutationFn: ({ qId, answer }: { qId: string; answer: string }) =>
      interviewsApi.submitAnswer(evalId!, qId, answer),
    onSuccess: (data) => {
      if (data.all_answered) {
        setCurrentIndex(-1);
      } else {
        setCurrentIndex(prev => prev + 1);
        setCurrentAnswer('');
      }
      refetch();
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => interviewsApi.generateReport(evalId!),
    onSuccess: () => navigate(`/interviews/report/${evalId}`),
  });

  if (isLoading) return <LoadingSpinner message={t('evaluations.flow.loadingMsg')} />;
  if (!evaluation) return <p className="text-red-500">{t('evaluations.flow.notFound')}</p>;

  if (evaluation.status === 'completed') {
    navigate(`/interviews/report/${evalId}`);
    return null;
  }

  const lang = i18n.language;
  const primaryLang = evaluation.primary_language || 'en';
  const primaryQuestions = evaluation.questions || [];
  const questions = (lang !== primaryLang && evaluation.questions_translations?.[lang]) || primaryQuestions;
  const answers = evaluation.answers || {};
  const totalAnswered = Object.keys(answers).length;
  const allAnswered = totalAnswered >= questions.length;

  const effectiveIndex = currentIndex === 0 && totalAnswered > 0
    ? questions.findIndex(q => !answers[q.id])
    : currentIndex;

  const currentQuestion = effectiveIndex >= 0 && effectiveIndex < questions.length
    ? questions[effectiveIndex]
    : null;

  return (
    <AnimatedPage>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold gradient-text mb-2">{t('evaluations.flow.title')}</h1>
        <p className="text-slate-500 mb-5">
          {evaluation.interview_round.replace('_', ' ')} &middot; {evaluation.interviewer_name || 'HR'}
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode('qa')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'qa'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/25'
                : 'bg-white/60 text-slate-600 hover:bg-white/80 border border-slate-200/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {t('evaluations.flow.qaMode')}
          </button>
          <button
            type="button"
            onClick={() => setMode('audio')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'audio'
                ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/25'
                : 'bg-white/60 text-slate-600 hover:bg-white/80 border border-slate-200/60'
            }`}
          >
            <Mic className="w-4 h-4" />
            {t('evaluations.flow.audioMode')}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'qa' ? (
            <motion.div key="qa" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Progress bar */}
              <div className="mb-8">
                <div className="flex justify-between text-sm text-slate-500 mb-1">
                  <span>{t('evaluations.flow.progress', { current: Math.min(totalAnswered + 1, questions.length), total: questions.length })}</span>
                  <span>{t('evaluations.flow.answered', { count: totalAnswered })}</span>
                </div>
                <div className="w-full bg-slate-200/50 rounded-full h-2.5 backdrop-blur-sm">
                  <motion.div
                    className="bg-gradient-to-r from-purple-500 to-indigo-600 h-2.5 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(totalAnswered / questions.length) * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {allAnswered || currentIndex === -1 ? (
                  <motion.div
                    key="complete"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    className="glass-card rounded-2xl p-8 text-center"
                  >
                    <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('evaluations.flow.allAnswered')}</h2>
                    <p className="text-slate-500 mb-6">{t('evaluations.flow.generatePrompt')}</p>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => reportMutation.mutate()}
                      disabled={reportMutation.isPending}
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-8 py-3 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                      {reportMutation.isPending ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> {t('evaluations.flow.generatingBtn')}</>
                      ) : t('evaluations.flow.generateBtn')}
                    </motion.button>
                  </motion.div>
                ) : currentQuestion ? (
                  <motion.div
                    key={currentQuestion.id}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    className="glass-card rounded-2xl p-6"
                  >
                    <div className="mb-1 text-xs text-purple-600 font-medium uppercase tracking-wide">
                      {currentQuestion.category.replace('_', ' ')}
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">{currentQuestion.text}</h2>
                    <textarea
                      className="w-full border border-slate-300/50 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[150px] resize-y bg-white/50 backdrop-blur-sm"
                      placeholder={t('evaluations.flow.answerPlaceholder')}
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                    />
                    <VoiceInput onTranscript={(text) => setCurrentAnswer(prev => prev ? prev + ' ' + text : text)} />
                    <div className="flex justify-end mt-4">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => answerMutation.mutate({ qId: currentQuestion.id, answer: currentAnswer })}
                        disabled={!currentAnswer.trim() || answerMutation.isPending}
                        className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                      >
                        {answerMutation.isPending ? t('evaluations.flow.savingBtn') : t('evaluations.flow.nextBtn')} <ChevronRight className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div key="audio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AudioUploadPanel
                evalId={evalId!}
                evaluation={evaluation}
                onReportReady={() => navigate(`/interviews/report/${evalId}`)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  );
}

// ── Voice Input ───────────────────────────────────────────────────────────────

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

function VoiceInput({ onTranscript }: VoiceInputProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(() => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);
  const interimRef = useRef('');

  function createRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-US';
    return r;
  }

  const start = () => {
    const r = createRecognition();
    recognitionRef.current = r;
    interimRef.current = '';

    r.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      interimRef.current = interim;
      if (final) onTranscript(final.trim());
    };

    r.onend = () => setIsRecording(false);
    r.onerror = () => setIsRecording(false);

    r.start();
    setIsRecording(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  if (!isSupported) return null;

  return (
    <div className="flex items-center gap-2 mt-2">
      <motion.button
        type="button"
        onClick={isRecording ? stop : start}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={isRecording ? t('evaluations.flow.recordStop') : t('evaluations.flow.recordingHint')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isRecording
            ? 'bg-red-500 text-white shadow-md shadow-red-500/30 animate-pulse'
            : 'bg-white/60 border border-slate-200/60 text-slate-600 hover:bg-white/80'
        }`}
      >
        {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        {isRecording ? t('evaluations.flow.recordStop') : t('evaluations.flow.recordStart')}
      </motion.button>
      {isRecording && (
        <span className="text-xs text-red-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />
          {t('evaluations.flow.recordStop')}…
        </span>
      )}
    </div>
  );
}

// ── Audio Upload Panel ────────────────────────────────────────────────────────

interface AudioUploadPanelProps {
  evalId: string;
  evaluation: Evaluation;
  onReportReady: () => void;
}

function AudioUploadPanel({ evalId, evaluation, onReportReady }: AudioUploadPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const transcriptStatus = evaluation.transcript_status ?? 'none';
  const transcript = evaluation.transcript;

  // Poll transcript status while processing
  const { data: polledStatus } = useQuery({
    queryKey: ['transcript-status', evalId],
    queryFn: () => interviewsApi.getTranscriptStatus(evalId),
    enabled: transcriptStatus === 'processing',
    refetchInterval: (query) => {
      const status = query.state.data?.transcript_status;
      return status === 'completed' || status === 'failed' ? false : 3000;
    },
  });

  useEffect(() => {
    const status = polledStatus?.transcript_status;
    if (status === 'completed' || status === 'failed') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      queryClient.invalidateQueries({ queryKey: ['evaluation', evalId] });
    }
  }, [polledStatus?.transcript_status, evalId, queryClient]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => interviewsApi.uploadAudio(evalId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', evalId] });
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => interviewsApi.generateReportFromTranscript(evalId),
    onSuccess: () => onReportReady(),
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      {/* Drop zone — shown when no transcript yet or previous attempt failed */}
      {(transcriptStatus === 'none' || transcriptStatus === 'failed') && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`glass-card rounded-2xl p-10 border-2 border-dashed text-center cursor-pointer transition-all ${
            dragOver ? 'border-teal-400 bg-teal-50/30' : 'border-slate-300/60 hover:border-teal-300/60'
          }`}
        >
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
          <FileAudio className="w-10 h-10 text-teal-500 mx-auto mb-3" />
          {selectedFile ? (
            <p className="text-sm font-medium text-slate-700">{selectedFile.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700">{t('evaluations.audio.dropZone')}</p>
              <p className="text-xs text-slate-400 mt-1">{t('evaluations.audio.formats')}</p>
            </>
          )}
          {transcriptStatus === 'failed' && (
            <p className="text-xs text-red-500 mt-2 flex items-center justify-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> {t('evaluations.audio.transcriptionFailed')}
            </p>
          )}
        </div>
      )}

      {/* Processing indicator */}
      {transcriptStatus === 'processing' && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <Loader2 className="w-10 h-10 text-teal-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">{t('evaluations.audio.transcribing')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('evaluations.audio.elapsed', { time: formatTime(elapsedSeconds) })}</p>
        </div>
      )}

      {/* Transcript display */}
      {transcriptStatus === 'completed' && transcript && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-semibold text-slate-900">{t('evaluations.audio.transcriptReady')}</h3>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5 font-mono text-xs bg-slate-50/60 rounded-lg p-3">
            {transcript.split('\n').map((line, i) => {
              const isSpeaker0 = line.startsWith('[SPEAKER_00]');
              return (
                <div key={i} className="flex gap-2">
                  <span className={`shrink-0 font-semibold ${isSpeaker0 ? 'text-purple-600' : 'text-teal-600'}`}>
                    {isSpeaker0 ? t('evaluations.audio.interviewer') : t('evaluations.audio.candidate')}
                  </span>
                  <span className="text-slate-600">{line.replace(/^\[SPEAKER_0[01]\]\s*/, '')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {(transcriptStatus === 'none' || transcriptStatus === 'failed') && selectedFile && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => uploadMutation.mutate(selectedFile)}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 shadow-md shadow-teal-500/25"
          >
            {uploadMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t('evaluations.audio.uploading')}</>
            ) : (
              <><Upload className="w-4 h-4" /> {t('evaluations.audio.transcribeBtn')}</>
            )}
          </motion.button>
        )}

        {transcriptStatus === 'completed' && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 shadow-md shadow-purple-500/25"
          >
            {reportMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t('evaluations.flow.generatingBtn')}</>
            ) : t('evaluations.flow.generateBtn')}
          </motion.button>
        )}
      </div>
    </div>
  );
}
