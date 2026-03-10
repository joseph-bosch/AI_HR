import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '../../api/chat';
import type { ChatMessage } from '../../types/chat';

const STORAGE_KEY = 'chat_history';

export default function ChatWidget() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
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
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Persist conversation to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    pinnedToBottom.current = true;

    // Add user message + empty assistant placeholder
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setIsStreaming(true);

    let accumulated = '';
    let finalToolsUsed: string[] = [];

    try {
      for await (const event of streamChat(text, history, i18n.language)) {
        if (event.error) {
          accumulated = t('chat.error');
          break;
        }
        if (event.chunk) {
          accumulated += event.chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: accumulated };
            return updated;
          });
        }
        if (event.done) {
          finalToolsUsed = event.tools_used ?? [];
        }
      }
    } catch {
      accumulated = t('chat.error');
    }

    // Stamp final message with tools_used if any
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        role: 'assistant',
        content: accumulated || t('chat.error'),
        ...(finalToolsUsed.length > 0 ? { tools_used: finalToolsUsed } : {}),
      };
      return updated;
    });
    setIsStreaming(false);
  };

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl flex items-center justify-center text-white"
        whileHover={{ scale: 1.1, boxShadow: '0 0 24px rgba(99,102,241,0.5)' }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Toggle HR Assistant"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen
            ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X className="w-6 h-6" />
              </motion.span>
            : <motion.span key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <Bot className="w-6 h-6" />
              </motion.span>
          }
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-24 right-6 z-50 w-80 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{ height: 480, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.3)' }}
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100/60"
                 style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-semibold text-sm text-slate-800">{t('chat.title')}</span>
              </div>
              <button
                onClick={handleClear}
                title={t('chat.clear')}
                className="p-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
              </button>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
              {messages.length === 0 && (
                <div className="mt-6 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mx-auto mb-3">
                    <Bot className="w-5 h-5 text-indigo-500" />
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{t('chat.welcome')}</p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[230px]">
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-sm'
                          : 'bg-white text-slate-800 rounded-bl-sm shadow-sm border border-slate-100/80'
                      }`}
                    >
                      {m.content
                        ? m.role === 'assistant'
                          ? (
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                                ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                                code: ({ children }) => <code className="bg-slate-100 rounded px-1 text-xs font-mono">{children}</code>,
                              }}
                            >
                              {m.content}
                            </ReactMarkdown>
                          )
                          : m.content
                        : isStreaming && i === messages.length - 1
                          ? (
                            <span className="inline-flex gap-1 items-center py-0.5">
                              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          )
                          : null
                      }
                    </div>
                    {m.tools_used && m.tools_used.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5 ml-1">
                        {t('chat.toolsUsed')}: {m.tools_used.map(n => n.replace(/_/g, ' ')).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-100/60">
              <div className="flex gap-2">
                <input
                  className="flex-1 text-sm bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent placeholder:text-slate-400 disabled:opacity-60"
                  placeholder={t('chat.placeholder')}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSend}
                  disabled={isStreaming || !input.trim()}
                  className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
