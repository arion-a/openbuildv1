interface AvatarProps {
  src?: string | null;
  name?: string | null | Array<string | null | undefined>;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-20 h-20 text-xl',
};

/** First letter of the profile name / handle — skips empty and auto `user_…` handles. */
export function avatarLetter(...names: Array<string | null | undefined>): string {
  const firstChar = (raw: string, skipGenerated: boolean) => {
    const t = raw.trim();
    if (!t) return '';
    if (skipGenerated && /^user_[a-f0-9]{3,}$/i.test(t)) return '';
    const m = t.match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '';
  };
  for (const n of names) {
    const c = firstChar(n || '', true);
    if (c) return c;
  }
  for (const n of names) {
    const c = firstChar(n || '', false);
    if (c) return c;
  }
  return '?';
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const parts = Array.isArray(name) ? name : [name];
  const initial = avatarLetter(...parts);
  const label = parts.find((p) => (p || '').trim()) || '';

  return (
    <div className={`${sizes[size]} rounded-full overflow-hidden bg-[#2a241e] ring-1 ring-[var(--line)] flex items-center justify-center flex-shrink-0 ${className}`}>
      {src ? (
        <img src={src} alt={label} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[var(--gold)] font-semibold">{initial}</span>
      )}
    </div>
  );
}
