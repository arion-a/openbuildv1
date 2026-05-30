interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
};

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = sizes[size];
  const initial = name?.[0]?.toUpperCase() || 'U';

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0 ${className}`}>
      {src ? (
        <img src={src} alt={name || ''} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-semibold">{initial}</span>
      )}
    </div>
  );
}
