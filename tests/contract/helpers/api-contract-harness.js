import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_BASE = (process.env.CONTRACT_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function createHarness() {
  let serverProcess;
  let tempDir;
  let dbPath = process.env.CONTRACT_DB_PATH ?? null;
  let apiBase = API_BASE;
  let serverOutput = '';

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomPort() {
    return 10_000 + Math.floor(Math.random() * 40_000);
  }

  async function waitForApi(timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${apiBase}/`);
        if (res.ok) return;
      } catch {
        // keep retrying
      }
      await sleep(250);
    }
    throw new Error(`API did not become ready at ${apiBase}. Output:\n${serverOutput}`);
  }

  async function start() {
    if (process.env.CONTRACT_API_BASE) {
      apiBase = API_BASE;
      await waitForApi();
      return;
    }

    tempDir = mkdtempSync(path.join(os.tmpdir(), 'chore-dashboard-contract-'));
    dbPath = path.join(tempDir, 'contract.db');
    const nodeBin = process.env.CONTRACT_API_NODE || 'node';
    const port = randomPort();
    apiBase = `http://127.0.0.1:${port}`;

    serverProcess = spawn(nodeBin, ['server/index.js'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
        HOST: '127.0.0.1',
        PORT: String(port)
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    serverProcess.stdout?.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.stderr?.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.on('exit', (code) => {
      serverOutput += `\n[server exited: ${code}]`;
    });

    await waitForApi();
  }

  async function stop() {
    if (serverProcess && !serverProcess.killed) {
      const proc = serverProcess;
      const exited = new Promise((resolve) => {
        proc.once('exit', () => resolve());
      });
      proc.kill();
      await Promise.race([exited, sleep(2_000)]);
      serverProcess = undefined;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
      dbPath = process.env.CONTRACT_DB_PATH ?? null;
      apiBase = API_BASE;
    }
  }

  async function requestJson(method, endpoint, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${apiBase}${endpoint}`, init);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return {
      status: res.status,
      data,
      text,
      contentType: res.headers.get('content-type'),
      headers: res.headers
    };
  }

  async function expectOk(method, endpoint, body) {
    const result = await requestJson(method, endpoint, body);
    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThan(300);
    return result.data;
  }

  function chorePayload(name, overrides = {}) {
    return {
      name,
      schedule_type: 'daily',
      schedule: {},
      time_of_day: 'AM',
      minutes: 10,
      parent_id: null,
      global_order: 0,
      is_active: true,
      tags: [],
      room_ids: [],
      ...overrides
    };
  }

  return {
    start,
    stop,
    getApiBase: () => apiBase,
    getDbPath: () => dbPath,
    requestJson,
    expectOk,
    chorePayload
  };
}
