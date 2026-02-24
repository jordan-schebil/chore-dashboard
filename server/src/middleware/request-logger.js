function truncate(value, maxLength) {
  if (typeof value !== 'string') return value;
  if (!Number.isInteger(maxLength) || maxLength <= 0) return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeBody(body, { maxBodyChars }) {
  if (body == null) return undefined;

  try {
    return JSON.parse(
      JSON.stringify(body, (key, value) => {
        if (/password|token|secret/i.test(key)) return '[redacted]';
        if (typeof value === 'string') return truncate(value, maxBodyChars);
        return value;
      })
    );
  } catch {
    return '[unserializable_body]';
  }
}

function formatDurationMs(startNs) {
  const elapsedNs = process.hrtime.bigint() - startNs;
  return Number(elapsedNs / BigInt(1e6));
}

export function requestLogger({ logBodies = false, maxBodyChars = 200 } = {}) {
  return function requestLoggerMiddleware(req, res, next) {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const logPayload = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: formatDurationMs(startedAt)
      };

      if (logBodies && req.body !== undefined) {
        logPayload.body = sanitizeBody(req.body, { maxBodyChars });
      }

      if (res.statusCode >= 500) {
        console.error('[express-api] request', logPayload);
        return;
      }

      console.log('[express-api] request', logPayload);
    });

    next();
  };
}
