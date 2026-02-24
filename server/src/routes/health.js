import { healthPayload } from './route-helpers.js';

export function registerHealthRoutes(app) {
  app.get('/', (req, res) => {
    void req;
    res.json(healthPayload());
  });
}
