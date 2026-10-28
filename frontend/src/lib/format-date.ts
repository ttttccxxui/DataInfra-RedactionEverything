// Copyright 2026 DataInfra-RedactionEverything Contributors

function parseDateValue(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = parseDateValue(value);
  if (!date) return value;
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function getDateTimestamp(value?: string | null): number {
  return parseDateValue(value)?.getTime() ?? 0;
}
