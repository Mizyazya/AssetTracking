const TZ = process.env.TIMEZONE ?? 'Europe/Kyiv';

export function formatDateTime(isoUtc: string | null | undefined): string {
  if (!isoUtc) return '—';
  try {
    const parts = new Intl.DateTimeFormat('uk-UA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(isoUtc));
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  } catch {
    return isoUtc;
  }
}

export function formatDate(isoUtc: string | null | undefined): string {
  return formatDateTime(isoUtc).slice(0, 10);
}
