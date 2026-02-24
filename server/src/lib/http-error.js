export class HttpError extends Error {
  constructor(status, detail, code = undefined) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.detail = detail;
    this.code = typeof code === 'string' && code ? code : undefined;
  }
}

export function httpError(status, detail, code) {
  return new HttpError(status, detail, code);
}
