import { createHarness } from './helpers/api-contract-harness.js';

const ISO_DATE = '2026-02-16';

const harness = createHarness();
const { expectOk, requestJson, chorePayload } = harness;

beforeAll(async () => {
  await harness.start();
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await expectOk('POST', '/reset');
});

describe('error envelope consistency (Express backend)', () => {
  it('returns JSON 404 envelope for unknown routes', async () => {
    const result = await requestJson('GET', '/definitely-not-a-route');

    expect(result.status).toBe(404);
    expect(result.contentType).toContain('application/json');
    expect(result.data).toEqual({
      detail: 'Not found',
      path: '/definitely-not-a-route',
      error: {
        status: 404,
        message: 'Not found',
        code: 'not_found'
      }
    });
  });

  it('preserves string detail and adds error metadata for route validation errors', async () => {
    const result = await requestJson('GET', '/completions');

    expect(result.status).toBe(422);
    expect(result.contentType).toContain('application/json');
    expect(result.data?.detail).toBe('start and end query params are required');
    expect(result.data?.error).toEqual({
      status: 422,
      message: 'start and end query params are required',
      code: 'completions_range_params_required'
    });
  });

  it('preserves object detail and mirrors message in error metadata', async () => {
    const created = await expectOk('POST', '/chores', chorePayload('Envelope Test Chore'));

    const result = await requestJson('PUT', `/daily-order/${ISO_DATE}`, {
      order: [created.id, 'missing-chore-id']
    });

    expect(result.status).toBe(400);
    expect(result.contentType).toContain('application/json');
    expect(result.data?.detail).toEqual({
      message: 'Unknown chore IDs in order',
      ids: ['missing-chore-id']
    });
    expect(result.data?.error).toEqual({
      status: 400,
      message: 'Unknown chore IDs in order',
      code: 'unknown_chore_ids_in_order'
    });
  });

  it('adds stable error codes for shared date and order validators', async () => {
    const invalidDate = await requestJson('GET', '/daily-order/2026-02-99');
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.data?.detail).toBe('Invalid date format. Use YYYY-MM-DD');
    expect(invalidDate.data?.error).toEqual({
      status: 400,
      message: 'Invalid date format. Use YYYY-MM-DD',
      code: 'invalid_date_format'
    });

    const chores = await expectOk('GET', '/chores');
    const duplicateOrder = await requestJson('PUT', '/chores/global-order', {
      order: [chores[0].id, chores[0].id]
    });
    expect(duplicateOrder.status).toBe(422);
    expect(duplicateOrder.data?.detail).toEqual({
      message: 'order cannot contain duplicate chore IDs'
    });
    expect(duplicateOrder.data?.error).toEqual({
      status: 422,
      message: 'order cannot contain duplicate chore IDs',
      code: 'order_contains_duplicate_chore_id'
    });
  });

  it('normalizes malformed JSON body errors to a stable JSON envelope', async () => {
    const res = await fetch(`${harness.getApiBase()}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{"name":'
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(data).toEqual({
      detail: 'Invalid JSON body',
      error: {
        status: 400,
        message: 'Invalid JSON body',
        code: 'invalid_json'
      }
    });
  });

  it('normalizes disallowed CORS origin errors to JSON 403 envelope', async () => {
    const res = await fetch(`${harness.getApiBase()}/`, {
      headers: {
        Origin: 'http://not-allowed.example'
      }
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(data).toEqual({
      detail: 'CORS origin not allowed',
      error: {
        status: 403,
        message: 'CORS origin not allowed',
        code: 'cors_origin_not_allowed'
      }
    });
  });
});
