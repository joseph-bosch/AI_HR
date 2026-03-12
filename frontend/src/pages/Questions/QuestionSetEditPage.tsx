import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { GripVertical, Trash2, Download, Check, Send, Bot, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { questionSetsApi, streamQuestionChat } from '../../api/questionSets';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AnimatedPage from '../../components/common/AnimatedPage';
import type { QuestionItem } from '../../types/questionSet';
import type { ChatMessage } from '../../types/chat';
import { useTranslation } from 'react-i18next';

const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

const categoryColors: Record<string, string> = {
  behavioral: 'bg-blue-100 text-blue-800',
  situational: 'bg-purple-100 text-purple-800',
  technical: 'bg-green-100 text-green-800',
  culture_fit: 'bg-orange-100 text-orange-800',
};

// ── Question list (left panel) ──────────────────────────────────────────────

function QuestionList({
  id,
  items,
  lang,
  primaryLang,
  onRefetch,
}: {
  id: string;
  items: QuestionItem[];
  lang: string;
  primaryLang: string;
  onRefetch: () => void;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const updateMutation = useMutation({
    mutationFn: ({ qId, data }: { qId: string; data: Record<string, unknown> }) =>
      questionSetsApi.updateQuestion(id, qId, data),
    onSuccess: () => { onRefetch(); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (qId: string) => questionSetsApi.deleteQuestion(id, qId),
    onSuccess: onRefetch,
  });

  return (
    <motion.div className="space-y-3" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
      {items.map((item, i) => {
        const displayText = (lang !== primaryLang && item.translations?.[lang]?.question_text) || item.question_text;
        const displayGuidance = (lang !== primaryLang && item.translations?.[lang]?.interviewer_guidance) || item.interviewer_guidance;
        return (
          <motion.div key={item.id} variants={itemVariants} className="glass-card rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <GripVertical className="w-5 h-5 text-slate-300 mt-1 cursor-grab flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-400">Q{i + 1}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[item.category.trim().toLowerCase().replace(/[\s-]+/g, '_')] || 'bg-slate-100 text-slate-800'}`}>
                    {item.category.replace(/_/g, ' ')}
                  </span>
                </div>
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => updateMutation.mutate({ qId: item.id, data: lang === primaryLang ? { question_text: editText } : { translations: { ...item.translations, [lang]: { ...item.translations?.[lang], question_text: editText } } } })} className="text-sm text-blue-600 hover:underline">{t('questions.save')}</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-sm text-slate-500 hover:underline">{t('common.cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-900 cursor-pointer hover:text-blue-600" onClick={() => { setEditingId(item.id); setEditText(displayText); }}>
                    {displayText}
                  </p>
                )}
                {displayGuidance && (
                  <p className="text-xs text-slate-500 mt-2"><strong>{t('questions.guidance')}:</strong> {displayGuidance}</p>
                )}
              </div>
              <button type="button" aria-label={t('common.delete')} onClick={() => deleteMutation.mutate(item.id)} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ── Chat panel (right panel) ────────────────────────────────────────────────

function QuestionChatPanel({
  questionSetId,
  language,
  onActionsApplied,
}: {
  questionSetId: string;
  language: string;
  onActionsApplied: () => void;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [applying, setApplying] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Auto-scroll only when pinned to bottom
  useEffect(() => {
    if (pinnedToBottom.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Within 80px of the bottom = pinned; any scroll up = unpinned
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const applyActions = async (actionsText: string) => {
    setApplying(true);
    const lines = actionsText.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const action = JSON.parse(line.trim());
        if (action.action === 'update_question' && action.question_id && action.new_text) {
          await questionSetsApi.updateQuestion(questionSetId, action.question_id, { question_text: action.new_text });
        } else if (action.action === 'add_question' && action.question_text) {
          await questionSetsApi.addQuestion(questionSetId, {
            category: action.category || 'behavioral',
            question_text: action.question_text,
            interviewer_guidance: action.guidance,
          });
        } else if (action.action === 'delete_question' && action.question_id) {
          await questionSetsApi.deleteQuestion(questionSetId, action.question_id);
        }
      } catch {
        // skip invalid JSON lines
      }
    }
    setApplying(false);
    onActionsApplied();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    pinnedToBottom.current = true; // re-pin whenever user sends a message

    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setStreaming(true);

    let accumulated = '';
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '' };
    setMessages([...history, assistantPlaceholder]);

    try {
      for await (const event of streamQuestionChat(questionSetId, text, messages, language)) {
        if (event.error) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: `Error: ${event.error}` };
            return updated;
          });
          break;
        }
        if (event.token) {
          accumulated += event.token;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: accumulated };
            return updated;
          });
        }
        if (event.done) {
          // Check for actions block
          const actionSep = '\n---ACTIONS---\n';
          const sepIdx = accumulated.indexOf(actionSep);
          if (sepIdx !== -1) {
            const conversational = accumulated.slice(0, sepIdx);
            const actionsText = accumulated.slice(sepIdx + actionSep.length);
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: conversational };
              return updated;
            });
            await applyActions(actionsText);
          }
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${msg}` };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/60 bg-white/60 rounded-t-2xl flex-shrink-0">
        <Bot className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-semibold text-slate-800">{t('questions.chatTitle')}</span>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-4">{t('questions.chatWelcome')}</p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === 'user' ? 'bg-purple-500' : 'bg-slate-200'}`}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-slate-600" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-purple-500 text-white rounded-tr-sm' : 'bg-white/80 border border-slate-200/60 text-slate-700 rounded-tl-sm'}`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-xs max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{msg.content || '…'}</ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {applying && (
          <p className="text-xs text-amber-600 text-center animate-pulse">{t('questions.chatApplying')}</p>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-slate-200/60 bg-white/60 rounded-b-2xl">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 text-xs border border-slate-300/60 rounded-xl px-3 py-2 bg-white/80 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400"
            placeholder={t('questions.chatPlaceholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={streaming}
          />
          <button
            type="button"
            aria-label={t('chat.send')}
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="p-2 rounded-xl bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function QuestionSetEditPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: qs, isLoading, refetch } = useQuery({
    queryKey: ['questionSet', id],
    queryFn: () => questionSetsApi.get(id!),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => questionSetsApi.finalize(id!),
    onSuccess: () => refetch(),
  });

  const handleExportPdf = async () => {
    const blob = await questionSetsApi.exportPdf(id!, i18n.language);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `questions_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleActionsApplied = () => {
    queryClient.invalidateQueries({ queryKey: ['questionSet', id] });
  };

  if (isLoading) return <LoadingSpinner />;
  if (!qs) return <p className="text-red-500">{t('questions.notFound')}</p>;

  const items = qs.items || [];
  const lang = i18n.language;
  const primaryLang = qs.primary_language || 'en';

  return (
    <AnimatedPage>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{qs.name}</h1>
          <p className="text-slate-500 text-sm mt-1">{qs.interview_round.replace('_', ' ')} &middot; {t('questions.questionCount', { count: items.length })}</p>
        </div>
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 text-sm"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <Download className="w-4 h-4" /> {t('questions.exportPdf')}
          </motion.button>
          {qs.status === 'draft' && (
            <motion.button
              type="button"
              onClick={() => finalizeMutation.mutate()}
              className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-2 rounded-lg hover:from-green-600 hover:to-emerald-600 text-sm shadow-lg shadow-green-500/25"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <Check className="w-4 h-4" /> {t('questions.finalize')}
            </motion.button>
          )}
        </div>
      </div>

      {/* Split pane */}
      <div className="flex gap-6 items-start">
        {/* Left — question list (60%) */}
        <div className="flex-[3] min-w-0">
          <QuestionList
            id={id!}
            items={items}
            lang={lang}
            primaryLang={primaryLang}
            onRefetch={() => refetch()}
          />
          <button type="button" onClick={() => navigate(`/questions/${id}`)} className="mt-6 text-sm text-blue-600 hover:underline">
            {t('questions.viewRubrics')}
          </button>
        </div>

        {/* Right — AI chat panel (40%) */}
        <div className="flex-[2] sticky top-4 glass-card rounded-2xl overflow-hidden h-[calc(100vh-140px)]">
          <QuestionChatPanel
            questionSetId={id!}
            language={lang}
            onActionsApplied={handleActionsApplied}
          />
        </div>
      </div>
    </AnimatedPage>
  );
}
