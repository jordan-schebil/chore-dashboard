import { registerHealthRoutes } from './health.js';
import { registerRoomRoutes } from './rooms.js';
import { registerChoreRoutes } from './chores.js';
import { registerDailyOrderRoutes } from './daily-order.js';
import { registerCompletionRoutes } from './completions.js';
import { registerSystemRoutes } from './system.js';

export function registerRoutes(app, context) {
  void context;

  registerHealthRoutes(app);
  registerRoomRoutes(app);
  registerChoreRoutes(app);
  registerDailyOrderRoutes(app);
  registerCompletionRoutes(app);
  registerSystemRoutes(app);
}
