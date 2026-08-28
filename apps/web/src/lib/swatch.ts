const HUES = [12, 18, 24, 32, 8, 355, 28];

export function swatchHue(title: string) {
  let n = 0;
  for (let i = 0; i < title.length; i++) n += title.charCodeAt(i) * (i + 3);
  return HUES[n % HUES.length];
}

export function swatchGradient(title: string) {
  const h = swatchHue(title || 'build');
  return `linear-gradient(135deg, hsl(${h} 62% 42%), hsl(${h + 18} 50% 22%))`;
}
