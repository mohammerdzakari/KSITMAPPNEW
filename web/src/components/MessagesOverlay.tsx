import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, errorMessage } from '../lib/api';
import { useDebounced, usePolling } from '../lib/hooks';
import { EmptyState, ErrorState, Skeleton, inputClass } from './ui';
import { relativeTime, shortTime } from '../lib/format';
import type { Conversation, Message, Person } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Opens (or creates) a direct conversation with this user. */
  startWith?: string | null;
  onStartHandled: () => void;
  onUnread: (count: number) => void;
}

export const MessagesOverlay = ({ isOpen, onClose, startWith, onStartHandled, onUnread }: Props) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Conversation | null>(null);
  const [peopleQuery, setPeopleQuery] = useState('');
  const debouncedPeople = useDebounced(peopleQuery, 350);
  const [people, setPeople] = useState<Person[]>([]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiGet<{ conversations: Conversation[]; totalUnread: number }>('/api/conversations');
      setConversations(res.conversations);
      onUnread(res.totalUnread);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [onUnread]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    void loadConversations().finally(() => setLoading(false));
  }, [isOpen, loadConversations]);

  usePolling(loadConversations, 8000, isOpen && !active);

  // Open a conversation requested from search results.
  useEffect(() => {
    if (!isOpen || !startWith) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiPost<{ id: string }>('/api/conversations/direct', { userId: startWith });
        if (cancelled) return;
        const found = conversations.find((c) => c.id === res.id);
        setActive(found ?? { id: res.id, type: 'direct', isGroup: false, title: null, partnerId: startWith, avatarUrl: null, lastMessage: null, lastMessageAt: null, unread: 0 });
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        onStartHandled();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startWith, isOpen, conversations, onStartHandled]);

  useEffect(() => {
    if (!isOpen || debouncedPeople.trim().length < 2) {
      setPeople([]);
      return;
    }
    let activeRequest = true;
    apiGet<{ people: Person[] }>(`/api/people?q=${encodeURIComponent(debouncedPeople.trim())}`)
      .then((res) => activeRequest && setPeople(res.people))
      .catch(() => activeRequest && setPeople([]));
    return () => {
      activeRequest = false;
    };
  }, [debouncedPeople, isOpen]);

  if (!isOpen) return null;

  if (active) {
    return (
      <ThreadView
        conversation={active}
        onBack={() => {
          setActive(null);
          void loadConversations();
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-right duration-200">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
          aria-label="Close messages"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="font-bold text-lg text-gray-800 dark:text-white">Messages</h2>
      </div>

      <div className="p-4 space-y-3">
        <input
          value={peopleQuery}
          onChange={(e) => setPeopleQuery(e.target.value)}
          placeholder="Find a student or staff member…"
          className={inputClass}
        />
        {people.map((person) => (
          <button
            key={person.userId}
            onClick={async () => {
              const res = await apiPost<{ id: string }>('/api/conversations/direct', { userId: person.userId });
              setActive({
                id: res.id,
                type: 'direct',
                isGroup: false,
                title: person.name,
                partnerId: person.userId,
                avatarUrl: person.avatarUrl,
                lastMessage: null,
                lastMessageAt: null,
                unread: 0,
              });
              setPeopleQuery('');
            }}
            className="w-full flex items-center gap-3 bg-gray-50 dark:bg-slate-800 rounded-lg p-2"
          >
            <img src={person.avatarUrl} className="w-9 h-9 rounded-full bg-gray-200" alt="" />
            <div className="flex-1 text-left">
              <p className="text-xs font-bold text-gray-800 dark:text-white">{person.name}</p>
              <p className="text-[10px] text-gray-500">
                {person.identifier ?? person.role} {person.department ? `• ${person.department}` : ''}
              </p>
            </div>
            <span className="text-[10px] font-bold text-ksitmo">Chat</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading && <Skeleton rows={3} />}
        {error && <ErrorState message={error} onRetry={() => void loadConversations()} />}
        {!loading && !error && conversations.length === 0 && (
          <EmptyState
            icon="💬"
            title="No conversations yet"
            hint="Search for a classmate above, or join a study room to start chatting."
          />
        )}
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setActive(conversation)}
              className="w-full flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700"
            >
              <img src={conversation.avatarUrl ?? undefined} className="w-11 h-11 rounded-full bg-gray-200" alt="" />
              <div className="flex-1 text-left min-w-0">
                <div className="flex justify-between">
                  <p className="text-sm font-bold text-gray-800 dark:text-white truncate">
                    {conversation.title ?? 'Conversation'}
                  </p>
                  <span className="text-[10px] text-gray-400">{relativeTime(conversation.lastMessageAt)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {conversation.isGroup ? '👥 ' : ''}
                  {conversation.lastMessage ?? 'No messages yet'}
                </p>
              </div>
              {conversation.unread > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {conversation.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const ThreadView = ({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ messages: Message[] }>(`/api/conversations/${conversation.id}/messages`);
      setMessages(res.messages);
      setError(null);
      await apiPost(`/api/conversations/${conversation.id}/read`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(load, 5000, true);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    try {
      const res = await apiPost<Message>(`/api/conversations/${conversation.id}/messages`, { body });
      setMessages((prev) => [...prev, res]);
    } catch (err) {
      setError(errorMessage(err));
      setText(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-gray-50 dark:bg-slate-900 flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Back">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <img src={conversation.avatarUrl ?? undefined} className="w-9 h-9 rounded-full bg-gray-200" alt="" />
        <div>
          <h2 className="font-bold text-sm text-gray-800 dark:text-white">
            {conversation.title ?? 'Conversation'}
          </h2>
          <p className="text-[10px] text-gray-400">{conversation.isGroup ? 'Study room' : 'Direct message'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <Skeleton rows={3} />}
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${
                message.mine
                  ? 'bg-ksitmb text-white rounded-tr-none'
                  : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-slate-700'
              }`}
            >
              {!message.mine && conversation.isGroup && (
                <p className="text-[10px] font-bold text-gray-400 mb-0.5">{message.senderName}</p>
              )}
              <p className="text-sm whitespace-pre-wrap">{message.body}</p>
              <p className={`text-[9px] mt-0.5 ${message.mine ? 'text-blue-200' : 'text-gray-400'}`}>
                {shortTime(message.createdAt)}
              </p>
            </div>
          </div>
        ))}
        {!loading && messages.length === 0 && (
          <EmptyState icon="👋" title="No messages yet" hint="Say hello to start the conversation." />
        )}
        <div ref={endRef} />
      </div>

      <div className="p-3 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="Type a message…"
          className="flex-1 bg-gray-100 dark:bg-slate-800 border-0 rounded-full px-4 py-3 text-sm outline-none text-gray-900 dark:text-white"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !text.trim()}
          className="w-12 h-12 bg-ksitmb rounded-full flex items-center justify-center text-white disabled:opacity-50"
          aria-label="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default MessagesOverlay;
