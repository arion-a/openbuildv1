import { useState } from 'react';

// Cover image + thumbnail strip. media[0] is the cover.
export function Gallery({ images, title }: { images: string[]; title?: string }) {
  const [active, setActive] = useState(0);
  if (!images || images.length === 0) return null;
  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-3">
      <div className="ob-card overflow-hidden">
        <img
          src={current}
          alt={title ? `${title} screenshot` : 'screenshot'}
          className="w-full max-h-[520px] object-contain bg-[#0d0b09]"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-lg overflow-hidden border ${
                i === active ? 'border-[var(--ember)]' : 'border-[var(--line)]'
              }`}
              aria-label={`Show image ${i + 1}`}
            >
              <img src={url} alt="" className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
