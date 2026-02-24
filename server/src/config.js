import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

function parseAllowedOrigins(raw) {
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}

function toPort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function getConfig(env = process.env) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const logRequests = toBoolean(env.LOG_REQUESTS, false);
  const logRequestBodies = logRequests && toBoolean(env.LOG_REQUEST_BODIES, false);

  return {
    host: env.HOST || '0.0.0.0',
    port: toPort(env.PORT, 8000),
    databasePath: env.DATABASE_PATH || 'chores.db',
    allowedOrigins,
    allowCredentials: !allowedOrigins.includes('*'),
    logRequests,
    logRequestBodies,
    logRequestBodyMaxChars: Math.max(32, toInt(env.LOG_REQUEST_BODY_MAX_CHARS, 200))
  };
}
