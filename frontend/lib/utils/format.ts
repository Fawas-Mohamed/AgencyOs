export const label = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
export function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
export function dateOnly(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}
export function budget(min: string | null, max: string | null, currency: string | null) {
  if (min === null && max === null) return 'Not provided';
  return [currency, min ?? 'Not provided', '–', max ?? 'Not provided'].filter(Boolean).join(' ');
}
