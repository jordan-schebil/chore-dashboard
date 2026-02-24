import { createApp } from './src/app.js';
import { getConfig } from './src/config.js';
import { createDb } from './src/db/connection.js';
import { initDbSchema } from './src/db/schema.js';

const config = getConfig();
let db;

console.log('[express-api] startup', {
  host: config.host,
  port: config.port,
  databasePath: config.databasePath,
  allowedOrigins: config.allowedOrigins,
  requestLogging: config.logRequests,
  requestBodyLogging: config.logRequestBodies
});

try {
  db = createDb(config);
  console.log('[express-api] database opened', { databasePath: config.databasePath });

  // Align schema and seed defaults when chores is empty.
  initDbSchema(db, { seedDefaults: true });
} catch (error) {
  console.error('[express-api] startup failed', {
    stage: db ? 'schema_init' : 'db_open',
    databasePath: config.databasePath,
    message: error?.message,
    stack: error?.stack
  });
  process.exit(1);
}

const app = createApp({ config, db });

const server = app.listen(config.port, config.host, () => {
  console.log(`[express-api] listening on http://${config.host}:${config.port}`);
});

server.on('error', (error) => {
  console.error('[express-api] listen failed', {
    host: config.host,
    port: config.port,
    message: error?.message,
    code: error?.code
  });
  try {
    db.close();
  } catch {
    // ignore
  }
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`[express-api] received ${signal}, shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
