const reportDateTime = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Rome',
});

export function formatReportDateTime(value: string): string {
  return reportDateTime.format(new Date(value));
}
