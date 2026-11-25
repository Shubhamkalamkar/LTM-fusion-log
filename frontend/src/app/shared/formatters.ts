export function badgeClass(value: string | null | undefined): string {
  if (!value) return 'badge badge-low';
  return `badge badge-${String(value).toLowerCase().replace(/\s+/g, '-')}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'Running...';
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
