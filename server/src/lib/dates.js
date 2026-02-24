import { httpError } from './http-error.js';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDateStrict(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function parseIsoDateOr400(value, fieldName = 'date') {
  const parsed = parseIsoDateStrict(value);
  if (!parsed) {
    throw httpError(400, `Invalid ${fieldName} format. Use YYYY-MM-DD`, 'invalid_date_format');
  }
  return parsed;
}

export function validateDateOr400(value, fieldName = 'date') {
  parseIsoDateOr400(value, fieldName);
  return value;
}

export function formatIsoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`;
}

export function addDaysUtc(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function diffDaysUtc(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}
