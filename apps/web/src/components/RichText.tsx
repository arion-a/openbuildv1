// Plain text with blank-line paragraphs and clickable links. Not full Markdown —
// enough for build/idea descriptions that people paste with the odd URL in them.

const SPLIT = /(https?:\/\/[^\s<]+)/g;

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const paragraphs = text.trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((para, i) => (
        <p key={i} className={`whitespace-pre-wrap${i > 0 ? ' mt-3' : ''}`}>
          {para.split(SPLIT).map((chunk, j) =>
            /^https?:\/\//.test(chunk) ? (
              <a
                key={j}
                href={chunk}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--gold)] hover:underline break-words"
              >
                {chunk}
              </a>
            ) : (
              <span key={j}>{chunk}</span>
            )
          )}
        </p>
      ))}
    </div>
  );
}
