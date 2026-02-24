import { parseIsoDateStrict } from './dates.js';
import { httpError } from './http-error.js';
import { normalizeOrderList } from './order.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasNonEmptyJsonValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

export function jsonStringOrNullForOptionalJson(value) {
  return hasNonEmptyJsonValue(value) ? JSON.stringify(value) : null;
}

export function requireObjectBody(body, label = 'body') {
  if (!isPlainObject(body)) {
    throw httpError(422, `${label} must be a JSON object`, 'invalid_json_object_body');
  }
  return body;
}

export function validateRoomPayload(body) {
  const input = requireObjectBody(body);
  if (typeof input.name !== 'string') {
    throw httpError(422, 'name is required', 'room_name_required');
  }
  return { name: input.name };
}

export function validateOrderPayload(body) {
  const input = requireObjectBody(body);
  return { order: normalizeOrderList(input.order) };
}

export function validateCompletionTogglePayload(body) {
  const input = requireObjectBody(body);
  const choreId = String(input.chore_id ?? '').trim();
  if (!choreId) {
    throw httpError(422, 'chore_id is required', 'chore_id_required');
  }
  const dateValue = String(input.date ?? '');
  if (!parseIsoDateStrict(dateValue)) {
    throw httpError(422, 'date must be in YYYY-MM-DD format', 'completion_date_invalid_format');
  }
  return { chore_id: choreId, date: dateValue };
}

export function validateChorePayload(body) {
  const input = requireObjectBody(body);

  if (typeof input.name !== 'string') {
    throw httpError(422, 'name is required', 'chore_name_required');
  }
  if (typeof input.schedule_type !== 'string') {
    throw httpError(422, 'schedule_type is required', 'schedule_type_required');
  }

  if (input.schedule !== undefined && input.schedule !== null && !isPlainObject(input.schedule)) {
    throw httpError(422, 'schedule must be an object or null', 'schedule_must_be_object_or_null');
  }
  if (input.tags !== undefined && input.tags !== null && !Array.isArray(input.tags)) {
    throw httpError(422, 'tags must be an array or null', 'tags_must_be_array_or_null');
  }
  if (input.room_ids !== undefined && input.room_ids !== null && !Array.isArray(input.room_ids)) {
    throw httpError(422, 'room_ids must be an array or null', 'room_ids_must_be_array_or_null');
  }

  return {
    name: input.name,
    schedule_type: input.schedule_type,
    schedule: input.schedule ?? null,
    time_of_day: input.time_of_day ?? null,
    minutes: input.minutes ?? null,
    parent_id: input.parent_id ?? null,
    global_order: input.global_order ?? 0,
    is_active: input.is_active ?? null,
    tags: input.tags ?? null,
    room_ids: input.room_ids ?? null
  };
}
