import { useEffect, useRef, useState } from 'react';
import { Share2, Check, Link as LinkIcon } from 'lucide-react';

interface ShareMenuProps {
  /** Canonical URL to share. */
  url: string;
  /** Title of the thing being shared. */
  title: string;
  /** One-liner appended after the title in the pre-filled post. */
  summary?: string;
}

const G = (d: string) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);

const X_ICON =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const LI_ICON =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';
const FB_ICON =
  'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z';
const TH_ICON =
  'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.056 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.362-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.918 13.918 0 013.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.324.145 1.52.715 2.633 1.8 3.219 3.14.815 1.872.895 4.926-1.635 7.446C21.253 23.176 19.008 24 12.186 24z';
const IG_ICON =
  'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z';

function openShare(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer,width=600,height=540');
}

export function ShareMenu({ url, title, summary }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'link' | 'caption' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const post = summary ? `${title} — ${summary}` : title;
  const e = encodeURIComponent;

  const platforms = [
    { key: 'x', label: 'X', icon: X_ICON, href: `https://twitter.com/intent/tweet?text=${e(post)}&url=${e(url)}` },
    { key: 'li', label: 'LinkedIn', icon: LI_ICON, href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}` },
    { key: 'fb', label: 'Facebook', icon: FB_ICON, href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { key: 'th', label: 'Threads', icon: TH_ICON, href: `https://www.threads.net/intent/post?text=${e(`${post} ${url}`)}` },
  ];

  const copy = async (kind: 'link' | 'caption') => {
    const value = kind === 'link' ? url : `${post}\n\n${url}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt('Copy this', value);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Share this build"
        aria-expanded={open}
        className="btn-ghost inline-flex items-center justify-center h-9 w-9 rounded-full"
      >
        <Share2 size={15} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 shadow-xl"
        >
          <p className="text-[11px] text-[var(--muted)] leading-snug bg-[#100e0c] border border-[var(--line)] rounded-lg px-2.5 py-2 mb-3 line-clamp-3">
            {post} — {url}
          </p>

          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {platforms.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => openShare(p.href)}
                title={`Share on ${p.label}`}
                aria-label={`Share on ${p.label}`}
                className="h-10 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--cream)] hover:border-[var(--ember)]/50 flex items-center justify-center"
              >
                {G(p.icon)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => copy('caption')}
              title="Copy caption for Instagram"
              aria-label="Copy caption for Instagram"
              className="h-10 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--cream)] hover:border-[var(--ember)]/50 flex items-center justify-center"
            >
              {copied === 'caption' ? <Check size={15} /> : G(IG_ICON)}
            </button>
          </div>

          <button
            type="button"
            onClick={() => copy('link')}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--cream)] hover:bg-white/5"
          >
            {copied === 'link' ? <Check size={14} /> : <LinkIcon size={14} />}
            {copied === 'link' ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}
