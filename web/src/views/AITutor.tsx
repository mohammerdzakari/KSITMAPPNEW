import { useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPost, errorMessage } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { ChatMessage } from '../types';
import Logo from '../components/Logo';

interface StoredMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'model',
  content:
    'Hello! I am your KSITM AI Tutor. I can help you summarize notes, explain complex topics, or quiz you for exams. What are we learning today?',
};

export const AITutor = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [status, history] = await Promise.all([
          apiGet<{ enabled: boolean }>('/api/ai/status'),
          apiGet<{ messages: StoredMessage[] }>('/api/ai/tutor/history'),
        ]);
        if (!active) return;
        setAiEnabled(status.enabled);
        setMessages(
          history.messages.length
            ? history.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))
            : [WELCOME],
        );
      } catch (err) {
        if (active) {
          setMessages([
            WELCOME,
            { id: 'err', role: 'model', content: errorMessage(err), isError: true },
          ]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = (textOverride ?? input).trim();
    if (!textToSend || sending) return;

    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: textToSend }]);

    try {
      const res = await apiPost<{ reply: string }>('/api/ai/tutor/message', { message: textToSend });
      setMessages((prev) => [...prev, { id: `m-${Date.now()}`, role: 'model', content: res.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'model', content: errorMessage(err), isError: true },
      ]);
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    await apiDelete('/api/ai/tutor/history');
    setMessages([WELCOME]);
  };

  const SuggestionChip = ({ text, prompt }: { text: string; prompt: string }) => (
    <button
      onClick={() => handleSend(prompt)}
      className="whitespace-nowrap bg-blue-50 dark:bg-slate-700 text-ksitmb dark:text-blue-200 text-sm px-4 py-2 rounded-full border border-blue-100 dark:border-slate-600 hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors"
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 p-4 shadow-sm flex items-center justify-between sticky top-0 z-10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-ksitmb flex items-center justify-center p-1">
            <Logo className="w-full h-full object-contain rounded-full bg-white p-0.5" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800 dark:text-white">KSITM AI Tutor</h2>
            <p className={`text-xs flex items-center gap-1 ${aiEnabled ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}`}>
              <span className={`w-2 h-2 rounded-full ${aiEnabled ? 'bg-green-500' : 'bg-orange-400'}`} />
              {loading ? 'Connecting…' : aiEnabled ? 'Online' : 'Not configured'}
            </p>
          </div>
        </div>
        <button onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-red-500">
          Clear chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-900 scrollbar-hide">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-ksitmb text-white rounded-tr-none'
                  : msg.isError
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-100 dark:border-red-900/30 rounded-tl-none'
                    : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-slate-700 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-none px-4 py-3 border border-gray-100 dark:border-slate-700 shadow-sm flex gap-2 items-center">
              <div className="w-2 h-2 bg-ksitmb dark:bg-blue-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-ksitmb dark:bg-blue-400 rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-ksitmb dark:bg-blue-400 rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white dark:bg-slate-900 border-t dark:border-slate-800 p-3 space-y-3 transition-colors">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <SuggestionChip text="Explain this topic" prompt="Explain the topic of process scheduling simply." />
          <SuggestionChip text="Quiz me" prompt="Generate 3 quiz questions about my recent courses." />
          <SuggestionChip text="Summarize text" prompt="Summarize this text: " />
          <SuggestionChip text="Study Tips" prompt="Give me 5 study tips for engineering students." />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={aiEnabled ? 'Ask your tutor anything…' : 'The AI tutor is not configured on this server.'}
            className="flex-1 bg-gray-100 dark:bg-slate-800 border-0 rounded-full px-4 py-3 text-sm focus:ring-2 focus:ring-ksitmb dark:focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
            disabled={sending}
          />
          <button
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            className="w-12 h-12 bg-ksitmb rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-900 transition-colors shadow-sm"
            aria-label="Send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        {user && !aiEnabled && (
          <p className="text-[10px] text-center text-gray-400">
            Set GEMINI_API_KEY on the server to enable the tutor.
          </p>
        )}
      </div>
    </div>
  );
};

export default AITutor;
