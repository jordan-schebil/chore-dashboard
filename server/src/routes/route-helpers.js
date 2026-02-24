import { httpError } from '../lib/http-error.js';

export function healthPayload() {
  return {
    message: 'Chore Dashboard API',
    status: 'running'
  };
}

export function runTransaction(db, handler) {
  return db.transaction(handler)();
}

export function requireFound(value, { detail = 'Not found', code = 'not_found' } = {}) {
  if (!value) {
    throw httpError(404, detail, code);
  }
  return value;
}

export function isSqliteConstraintError(error) {
  return String(error?.code || '').startsWith('SQLITE_CONSTRAINT');
}
