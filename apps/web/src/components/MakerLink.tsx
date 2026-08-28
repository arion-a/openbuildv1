import { Link } from 'react-router-dom';

export function MakerLink({
  username,
  className = '',
  children,
}: {
  username?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (!username) return <span className={className}>{children}</span>;
  return (
    <Link
      to={`/u/${username}`}
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
