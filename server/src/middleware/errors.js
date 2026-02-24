function firstMessage(detail, fallback = 'Request failed') {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) {
    return detail.message;
  }
  return fallback;
}

function sendError(res, { status, detail, code, path }) {
  const payload = {
    detail,
    error: {
      status,
      message: firstMessage(detail, status >= 500 ? 'Internal Server Error' : 'Request failed')
    }
  };

  if (code) {
    payload.error.code = code;
  }
  if (path) {
    payload.path = path;
  }

  res.status(status).json(payload);
}

function classifyFrameworkError(err) {
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, detail: 'Invalid JSON body', code: 'invalid_json' };
  }

  if (err?.type === 'entity.too.large') {
    return { status: 413, detail: 'Request body too large', code: 'request_body_too_large' };
  }

  if (typeof err?.message === 'string' && err.message.startsWith('CORS origin not allowed:')) {
    return { status: 403, detail: 'CORS origin not allowed', code: 'cors_origin_not_allowed' };
  }

  return null;
}

export function notFoundHandler(req, res) {
  sendError(res, {
    status: 404,
    detail: 'Not found',
    code: 'not_found',
    path: req.originalUrl
  });
}

export function errorHandler(err, req, res, next) {
  void next;

  const frameworkError = classifyFrameworkError(err);
  const status = frameworkError?.status ?? (Number.isInteger(err?.status) ? err.status : 500);
  const detail =
    frameworkError?.detail ??
    (status >= 500 ? 'Internal Server Error' : err?.detail || err?.message || 'Request failed');
  const code =
    frameworkError?.code ??
    (status >= 500 ? 'internal_server_error' : typeof err?.code === 'string' ? err.code : undefined);

  if (status >= 500) {
    console.error('[express-api] unhandled error', {
      path: req.originalUrl,
      method: req.method,
      message: err?.message,
      stack: err?.stack
    });
  }

  sendError(res, { status, detail, code });
}
