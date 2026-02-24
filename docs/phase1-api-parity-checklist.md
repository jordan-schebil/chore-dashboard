# Phase 1: API Contract Freeze (Migration Record)

Date: 2026-02-21

## Goal
Lock the current backend behavior as the migration target so the Express implementation can be validated for parity, not just "feature similarity."

## Source Of Truth Used
- Retired backend implementation snapshot (captured at migration start)
- Retired backend regression tests (captured at migration start)
- `src/api.js:1` (frontend API usage)
- `tests/contract/api-http-parity.test.js` (HTTP contract expectations)
- `tests/contract/api-fixture-snapshots.test.js` (fixture-backed response snapshots)

## Global Contract Rules
- API base is expected at `http://localhost:8000` (frontend default in `src/api.js:6`).
- JSON request/response throughout.
- CORS allowlist comes from `ALLOWED_ORIGINS`, defaulting to:
  - `http://localhost:5173`
  - `http://localhost:3000`
- Database path comes from `DATABASE_PATH`, default `chores.db`.
- SQLite foreign keys are enabled per connection (`PRAGMA foreign_keys = ON`).

## Data Contract Summary

### Chore shape (response)
- `id: string`
- `name: string`
- `schedule_type: "daily" | "weekly" | "monthly" | "seasonal" | "one_time" | "interval_days"`
- `schedule: object | null`
- `time_of_day: "AM" | "PM" | null`
- `minutes: number | null`
- `parent_id: string | null`
- `global_order: number` (default `0`)
- `is_active: boolean` (default `true`)
- `tags: string[]` (defaults to `[]`)
- `room_ids: string[]` (defaults to `[]`)

### Room shape
- `id: string`
- `name: string` (unique)

### Write payload validation rules
- `OrderUpdate.order`:
  - no empty IDs after trim
  - no duplicates
- `CompletionToggle.chore_id`:
  - required, non-empty after trim
- `CompletionToggle.date`:
  - must be `YYYY-MM-DD` ISO date

## Endpoint Matrix

### Health
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| GET | `/` | none | `{"message":"Chore Dashboard API","status":"running"}` | none |

### Rooms
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| GET | `/rooms` | none | `Room[]` sorted by `name` | none |
| POST | `/rooms` | `{ "name": string }` | created `Room` | `400 "Room name already exists"` |
| PUT | `/rooms/{room_id}` | `{ "name": string }` | updated `Room` | `404 "Room not found"`, `400 "Room name already exists"` |
| DELETE | `/rooms/{room_id}` | none | `{"deleted":"<room_id>"}` | `404 "Room not found"` |

### Chores CRUD
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| GET | `/chores` | none | `Chore[]` sorted by `schedule_type,name` | none |
| GET | `/chores/{chore_id}` | none | `Chore` | `404 "Chore not found"` |
| POST | `/chores` | `ChoreCreate` | created `Chore` | `400 "Parent chore not found"` |
| PUT | `/chores/{chore_id}` | `ChoreUpdate` | updated chore payload + `id` | `404 "Chore not found"`, `400 "Parent chore not found"` |
| DELETE | `/chores/{chore_id}` | none | `{"deleted":"<chore_id>"}` | `404 "Chore not found"` |
| PUT | `/chores/global-order` | `{ "order": string[] }` | `422` in baseline runtime due route collision with `PUT /chores/{chore_id}` | Validation errors for missing `ChoreUpdate` fields |

### Daily order
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| GET | `/daily-order/{date_str}` | none | `{"date":"YYYY-MM-DD","order":[ids...]}` | `400 "Invalid date format. Use YYYY-MM-DD"` |
| PUT | `/daily-order/{date_str}` | `{ "order": string[] }` | `{"date":"YYYY-MM-DD","updated":<count>}` | `400` invalid date, `400` unknown chore IDs |

### Chore views and scheduling
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| GET | `/chores/{chore_id}/subtasks` | none | `{"parent_id":"...","subtasks":Chore[]}` | none (empty list if none) |
| GET | `/chores-with-subtasks` | none | top-level chores with `subtasks`, `has_subtasks`, `total_minutes` | none |
| GET | `/chores/for-date/{date_str}` | none | `{"date":"YYYY-MM-DD","chores":Chore[]}` (leaf-level only) | `400 "Invalid date format. Use YYYY-MM-DD"` |
| GET | `/chores/for-range/{start}/{end}` | none | `{"start":"...","end":"...","chores_by_date":{date:Chore[]}}` | `400` invalid date, `400 "end must be on or after start"` |

### Completions
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| GET | `/completions/{date_str}` | none | `{"date":"YYYY-MM-DD","completed":[ids...]}` | no explicit date-format validation |
| GET | `/completions?start=...&end=...` | none | `{ "YYYY-MM-DD": [ids...] }` | no explicit date-format validation |
| POST | `/completions/toggle` | `{ "chore_id": string, "date":"YYYY-MM-DD" }` | `{"chore_id":"...","date":"...","completed":true/false}` | `404 "Chore not found"`, `400 "Invalid completion payload"` |

### System
| Method | Path | Body | Success | Known errors |
|---|---|---|---|---|
| POST | `/reset` | none | `{"status":"ok","reset":true}` | none |

## Critical Behavioral Invariants To Preserve
- Subtask create/update must inherit parent `schedule_type` and `schedule_json`.
- Subtask create/update inherits parent `is_active`/`tags` when omitted.
- Subtask create/update inherits parent `room_ids` when omitted.
- Creating a subtask nulls parent `time_of_day` and `minutes`.
- Updating a parent chore cascades `schedule_type`, `schedule_json`, `is_active`, `tags`, and `room_ids` to all subtasks.
- Deleting a parent chore cascades to subtasks and related `completions`, `daily_order`, `chore_rooms`.
- `for-date`/`for-range` return leaf chores only:
  - standalone chores included when schedule matches
  - subtasks included when parent schedule matches
  - parent chores with subtasks excluded
- `weekly` interval > 1 uses `week_parity`.
- `monthly` interval > 1 can use `month_parity`.
- `seasonal` supports `interval_months` cadence with month anchor.
- `reset` clears core data then reseeds defaults.
- Mutating endpoints write audit rows.
- Empty schedule objects (`{}`) may round-trip as `null` in persisted/read responses (notably for `daily` chores).

## Known Baseline Defect Captured By Contract Tests
- `PUT /chores/global-order` is currently shadowed by `PUT /chores/{chore_id}` and returns `422` for the frontend payload shape.
  - This is frozen as "current behavior" for baseline tests.
  - Migration decision required: preserve exact behavior for strict parity, or intentionally fix and update contract expectations.
  - Phase 3 outcome: Express intentionally fixes this route collision and the current contract suite now targets Express behavior by default.

## Audit Log Contract (Mutations)
- Rooms:
  - create/update/delete -> `entity_type = "room"`
- Chores:
  - create/update/delete -> `entity_type = "chore"`
- Orders:
  - global reorder -> `action = "reorder", entity_type = "global_order", entity_id = "global"`
  - daily reorder -> `action = "reorder", entity_type = "daily_order", entity_id = <date>`
- Completions:
  - toggle -> `action = "toggle", entity_type = "completion", entity_id = <chore_id>`
- Reset:
  - `action = "reset", entity_type = "system", entity_id = "default_seed"`

## Frontend Dependency Map (Current)
- `fetchChores` -> `GET /chores`
- `createChore` -> `POST /chores`
- `updateChore` -> `PUT /chores/{id}`
- `deleteChore` -> `DELETE /chores/{id}`
- `updateGlobalOrder` -> `PUT /chores/global-order`
- `fetchChoresWithSubtasks` -> `GET /chores-with-subtasks`
- `fetchChoresForRange` -> `GET /chores/for-range/{start}/{end}`
- `fetchSubtasks` -> `GET /chores/{id}/subtasks`
- `fetchRooms` -> `GET /rooms`
- `createRoom` -> `POST /rooms`
- `updateRoom` -> `PUT /rooms/{id}`
- `deleteRoom` -> `DELETE /rooms/{id}`
- `fetchCompletionsForDate` -> `GET /completions/{date}`
- `fetchCompletionsRange` -> `GET /completions?start=&end=`
- `toggleCompletion` -> `POST /completions/toggle`
- `fetchDailyOrder` -> `GET /daily-order/{date}`
- `setDailyOrder` -> `PUT /daily-order/{date}`
- `resetToDefaults` -> `POST /reset`

## Validation/Error Cases In Contract Tests
- Duplicate IDs in `order` payload must be rejected.
- Empty/blank IDs in `order` payload must be rejected.
- Invalid completion date format must be rejected.
- Unknown chore IDs in global/daily order must return 400 with ID list.
- Invalid `daily-order` path date must return 400.
- `for-range` with end before start must return 400.
- Toggle completion for unknown chore must return 404.
- Room create/update duplicate name must return 400.

## Phase 1 Checklist Status
- [x] Route inventory frozen.
- [x] Request/response shapes documented.
- [x] Error/status behaviors documented.
- [x] Side effects and invariants documented.
- [x] Frontend-to-endpoint dependency map documented.
- [x] Add HTTP-level golden tests for each endpoint (`tests/contract/api-http-parity.test.js`).
- [x] Capture fixture-backed response examples for regression snapshots (`tests/contract/api-fixture-snapshots.test.js`, `tests/contract/fixtures/expected/baseline-fixture-snapshots.json`).
