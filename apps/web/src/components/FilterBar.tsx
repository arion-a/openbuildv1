interface SortOption {
  id: string;
  label: string;
}

interface FilterBarProps {
  sort: string;
  onSort: (s: string) => void;
  sorts: SortOption[];
  domain: string;
  onDomain: (d: string) => void;
  domains: string[];
  tool?: string;
  onTool?: (t: string) => void;
  tools?: string[];
}

const selectClass =
  'bg-[#100e0c] border border-[var(--line)] rounded-full text-xs px-3 py-1.5 text-[var(--cream)] outline-none focus:border-[var(--ember)]/60';

export function FilterBar({ sort, onSort, sorts, domain, onDomain, domains, tool, onTool, tools }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {sorts.map((s) => (
        <button
          key={s.id}
          onClick={() => onSort(s.id)}
          className={
            sort === s.id
              ? 'btn-ember px-3.5 py-1.5 text-xs'
              : 'btn-ghost px-3.5 py-1.5 text-xs'
          }
        >
          {s.label}
        </button>
      ))}

      {domains.length > 0 && (
        <select value={domain} onChange={(e) => onDomain(e.target.value)} className={selectClass} aria-label="Filter by domain">
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}

      {tools && tools.length > 0 && onTool && (
        <select value={tool || ''} onChange={(e) => onTool(e.target.value)} className={selectClass} aria-label="Filter by tool">
          <option value="">All tools</option>
          {tools.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
