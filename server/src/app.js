import express from 'express';
import cors from 'cors';
import { registerRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestLogger } from './middleware/request-logger.js';

function createCorsOptions(config) {
  return {
    origin(origin, callback) {
      // Allow non-browser clients and server-to-server calls.
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: config.allowCredentials
  };
}

export function createApp({ config, db }) {
  const app = express();

  app.set('config', config);
  app.set('db', db);

  if (config.logRequests) {
    app.use(
      requestLogger({
        logBodies: config.logRequestBodies,
        maxBodyChars: config.logRequestBodyMaxChars
      })
    );
  }

  app.use(cors(createCorsOptions(config)));
  app.use(express.json({ limit: '1mb' }));

  registerRoutes(app, { config, db });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
