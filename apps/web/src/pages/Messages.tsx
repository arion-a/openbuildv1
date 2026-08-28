import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { MakerLink } from '../components/MakerLink';

interface Thread {
  username: string;
  display_name: string;
  avatar_url: string | null;
  last: { body: string; created_at: string; mine: boolean };
  unread: number;
}
interface Msg {
  id: string;
  body: string;
  created_at: string;
  mine: boolean;
}
interface Convo {
  with: { username: string; display_name: string; avatar_url: string | null };
  messages: Msg[];
}

export function Messages() {
  const [params, setParams] = useSearchParams();
  const active = params.get('to');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [convo, setConvo] = useState<Convo | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => api.getMessageThreads().then(setThreads).catch(() => setThreads([]));

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (!active) {
      setConvo(null);
      return;
    }
    let live = true;
    api
      .getConversation(active)
      .then((c) => live && setConvo(c))
      .catch(() => live && setError('Could not open that conversation.'));
    return () => {
      live = false;
    };
  }, [active]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [convo?.messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const msg = await api.sendMessage(active, draft.trim());
      setDraft('');
      setConvo((c) => (c ? { ...c, messages: [...c.messages, msg] } : c));
      loadThreads();
    } catch (err: any) {
      setError(err.message || 'Message did not send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-6">
        <p className="label-kicker mb-2">You</p>
        <h1 className="font-display text-4xl">Messages</h1>
      </div>

      {!active ? (
        threads.length === 0 ? (
          <div className="ob-panel p-10 text-center">
            <p className="text-[var(--muted)]">No messages yet.</p>
            <p className="text-sm text-[var(--muted)] mt-2">
              Open a builder’s page and hit “Message” to start one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map((t) => (
              <button
                key={t.username}
                onClick={() => setParams({ to: t.username })}
                className="ob-panel w-full flex items-center gap-3 p-4 text-left hover:border-[var(--ember)]/40"
              >
                <Avatar src={t.avatar_url} name={[t.display_name, t.username]} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{t.display_name}</p>
                    {t.unread > 0 && (
                      <span className="shrink-0 text-[10px] font-bold bg-[var(--ember)] text-white rounded-full px-1.5 py-0.5">
                        {t.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)] truncate">
                    {t.last.mine ? 'You: ' : ''}
                    {t.last.body}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="ob-panel flex flex-col h-[70vh]">
          <div className="flex items-center gap-3 p-4 border-b border-[var(--line)]">
            <button onClick={() => setParams({})} className="text-[var(--muted)] hover:text-[var(--cream)]" aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            {convo && (
              <MakerLink username={convo.with.username} className="flex items-center gap-2">
                <Avatar src={convo.with.avatar_url} name={[convo.with.display_name, convo.with.username]} size="sm" />
                <span className="text-sm font-semibold">{convo.with.display_name}</span>
              </MakerLink>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {convo?.messages.length === 0 && (
              <p className="text-sm text-[var(--muted)] text-center py-8">Say hello.</p>
            )}
            {convo?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    m.mine ? 'bg-[var(--ember)] text-white' : 'bg-[#100e0c] border border-[var(--line)] text-[var(--cream)]'
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-[var(--line)]">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…"
              className="ob-input flex-1"
              maxLength={5000}
            />
            <button type="submit" disabled={sending || !draft.trim()} className="btn-ember p-2.5 disabled:opacity-50">
              <Send size={16} />
            </button>
          </form>
          {error && <p className="text-red-400 text-xs px-4 pb-3">{error}</p>}
        </div>
      )}
    </div>
  );
}
