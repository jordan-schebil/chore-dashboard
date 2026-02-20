# Chore Dashboard API

FastAPI backend for the Chore Dashboard React application.

## Quick Start

```bash
# 1. Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Initialize the database (run the schema SQL)
sqlite3 chores.db < ../chore_dashboard_schema.sql

# 4. Start the API server
uvicorn main:app --reload --port 8000
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Endpoints Overview

### Chores CRUD
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chores` | List all chores (with optional filters) |
| GET | `/chores/{id}` | Get single chore |
| POST | `/chores` | Create new chore |
| PUT | `/chores/{id}` | Update chore |
| DELETE | `/chores/{id}` | Soft delete chore |

### Calendar / Date-based
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chores/date/{date}` | Get chores for specific date |
| GET | `/calendar/month/{year}/{month}` | Get month summary for heatmap |

### Completions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/completions` | Mark chore complete |
| DELETE | `/completions/{chore_id}/{date}` | Unmark completion |
| POST | `/completions/toggle` | Toggle completion state |
| GET | `/completions/{date}` | Get all completions for date |

### Data Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/export` | Export all data as JSON |
| POST | `/import` | Import data from JSON |
| POST | `/reset` | Reset to initial seed data |

## Example API Calls

```bash
# List all chores
curl http://localhost:8000/chores

# Get chores for today
curl http://localhost:8000/chores/date/2026-02-01

# Create a new daily chore
curl -X POST http://localhost:8000/chores \
  -H "Content-Type: application/json" \
  -d '{"name": "Feed the fish", "frequency": "daily", "time_of_day": "AM", "minutes": 2}'

# Toggle completion
curl -X POST http://localhost:8000/completions/toggle \
  -H "Content-Type: application/json" \
  -d '{"chore_id": "abc-123", "completed_date": "2026-02-01"}'

# Get month summary for calendar heatmap
curl http://localhost:8000/calendar/month/2026/2
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHORE_DB_PATH` | `chores.db` | Path to SQLite database |

## Project Structure

```
chore_api/
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── chores.db           # SQLite database (created from schema)
└── README.md           # This file
```

## Connecting to React Frontend

Update your React app to call these endpoints instead of `window.storage`. 
The API uses CORS to allow requests from:
- http://localhost:3000 (Create React App)
- http://localhost:5173 (Vite)

## Next Steps

1. Add authentication (e.g., FastAPI-Users, JWT)
2. Add user_id to chores/completions for multi-user support
3. Deploy with Docker or to a cloud service
4. Consider PostgreSQL for production
