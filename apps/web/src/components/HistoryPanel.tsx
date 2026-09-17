import { History } from 'lucide-react';

interface HistoryEntry {
  id: string;
  action: 'edit' | 'delete';
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  created_at: string;
  actor_name?: string;
  actor_username?: string;
}

// Fields that are bookkeeping, not content — skip them in the diff view.
const IGNORE_FIELDS = new Set([
  'id', 'owner_id', 'author_id', 'created_at', 'updated_at', 'upvotes',
  'status', 'stage', 'repo_name', 'deleted_at', 'build_id', 'search_tsv', 'tags',
]);

function truncate(v: unknown, n = 60): string {
  const s = Array.isArray(v) ? v.join(', ') : String(v ?? '(empty)');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function diffFields(before: Record<string, any> | null, after: Record<string, any> | null) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const key of keys) {
    if (IGNORE_FIELDS.has(key)) continue;
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changes.push({ field: key, from: before[key], to: after[key] });
  }
  return changes;
}

function timeAgo(date: string) {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No edits or deletions yet.</p>;
  }
  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const changes = entry.action === 'edit' ? diffFields(entry.before, entry.after) : [];
        return (
          <div key={entry.id} className="ob-panel p-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <History size={12} />
              <span className={entry.action === 'delete' ? 'text-red-400 font-medium' : 'font-medium text-[var(--cream)]'}>
                {entry.action === 'delete' ? 'Deleted' : 'Edited'}
              </span>
              <span>by {entry.actor_name || entry.actor_username || 'unknown'}</span>
              <span>· {timeAgo(entry.created_at)}</span>
            </div>
            {entry.action === 'edit' && (
              <ul className="mt-2 space-y-1">
                {changes.length === 0 && <li className="text-[var(--muted)]">No visible field changes.</li>}
                {changes.map((c) => (
                  <li key={c.field}>
                    <span className="text-[var(--muted)]">{c.field}:</span>{' '}
                    <span className="line-through text-[var(--muted)]">{truncate(c.from)}</span>{' '}
                    → <span>{truncate(c.to)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
