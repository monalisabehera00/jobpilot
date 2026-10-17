import { Pipe, PipeTransform } from '@angular/core';

// The API returns "YYYY-MM-DD" dates and "YYYY-MM-DD HH:MM:SS" timestamps without a time zone.
// Parsing the parts as local time avoids new Date("YYYY-MM-DD") shifting the day by UTC offset.
function parseApiDate(value: string): Date {
  const [datePart = '', timePart = '00:00:00'] = value.split(' ');
  const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number);
  const [hours = 0, minutes = 0] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isFollowUpDue(date: string | null): boolean {
  return !!date && date <= todayIso();
}

@Pipe({ name: 'apiDate' })
export class ApiDatePipe implements PipeTransform {
  transform(value: string | null | undefined, withTime = false): string {
    if (!value) return '—';
    return parseApiDate(value).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
  }
}
