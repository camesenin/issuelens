# IssueLens: AI-Powered Issue & PR Triage Dashboard for Open-Source Maintainers

**IssueLens** is a full-stack triage and prioritization dashboard built for open-source maintainers. It connects to GitHub repositories, ingests open Issues and Pull Requests, and uses AI-assisted analysis to classify severity, suggest labels, detect potential duplicates, summarize long discussion threads, and surface high-impact items that need maintainer attention first.

---

## Key Features

- **Unified Issue & PR Triage Queue**: View, filter, and sort open GitHub Issues and Pull Requests in one streamlined interface.
- **AI Triage & Summarization**: Automatically generate concise summaries, recommended labels, priority levels (`critical`, `high`, `medium`, `low`), and sentiment/urgency indicators.
- **GitHub Repository Sync**: Fetch live repository issues and pull requests asynchronously via `httpx` and persist them locally in SQLite using SQLAlchemy 2.x.
- **Fast & Modern Stack**:
  - **Backend**: FastAPI, SQLAlchemy 2.x (Typed `Mapped` ORM), Pydantic v2 validation schemas, and `httpx` async HTTP client.
  - **Frontend**: React 19 + Vite, Tailwind CSS, and Lucide React icons.

---

## Project Architecture

```text
issuelens/
├── backend/                  # FastAPI + SQLAlchemy 2.x + Pydantic v2 + httpx
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI application & API endpoints
│   │   ├── database.py       # SQLAlchemy 2.x engine & session configuration
│   │   ├── models.py         # SQLAlchemy 2.x declarative ORM models
│   │   ├── schemas.py        # Pydantic v2 request/response schemas
│   │   └── github_client.py  # Async httpx client for GitHub API & triage service
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── .env.example
├── frontend/                 # Vite + React + Tailwind CSS + Lucide React
│   ├── src/
│   │   ├── App.jsx           # Main IssueLens Triage Dashboard UI
│   │   ├── main.jsx          # React entry point
│   │   └── index.css         # Tailwind CSS directives & base styles
│   ├── index.html
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## Required Environment Variables

Create a `.env` file in `/backend` (and optionally in `/frontend` or the project root when using Docker Compose). You can copy the provided `.env.example` files as a starting point.

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | No | `sqlite:///./issuelens.db` | SQLAlchemy 2.x database connection URL (SQLite by default). |
| `GITHUB_TOKEN` | Recommended | `""` | GitHub Personal Access Token (`repo` or `public_repo` scope) to avoid GitHub API rate limits when syncing issues and PRs. |
| `AI_API_KEY` | Recommended | `""` | API key for the AI provider (e.g., Gemini / OpenAI API key) powering automated issue & PR triage summaries and priority scoring. |
| `AI_MODEL` | No | `gemini-2.5-flash` | Model identifier used for AI triage classification and summarization. |
| `CORS_ORIGINS` | No | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated list of allowed frontend origins for CORS. |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | No | `http://localhost:8000` | Base URL for the IssueLens FastAPI backend service. |

---

## Local Setup Instructions

### Option 1: Run with Docker Compose (Quickest)

1. **Configure Environment Variables (Optional)**:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. **Start Both Services**:
   ```bash
   docker compose up --build
   ```
3. **Access the Application**:
   - **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
   - **Backend API & Docs (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

### Option 2: Run Locally Without Docker

#### 1. Backend Setup (`/backend`)

**Prerequisites**: Python 3.10+

```bash
cd backend

# 1. Create and activate a virtual environment
python -m venv .venv

# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# On macOS / Linux:
# source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env

# 4. Run the FastAPI development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend API will be available at `http://localhost:8000` and interactive OpenAPI docs at `http://localhost:8000/docs`.

#### 2. Frontend Setup (`/frontend`)

**Prerequisites**: Node.js 18+ and npm

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment variables (optional)
cp .env.example .env

# 3. Start the Vite development server
npm run dev
```

The frontend application will be available at `http://localhost:5173`.

---

## API Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check returning service and database status. |
| `GET` | `/api/items` | List tracked Issues and PRs with optional `item_type`, `priority`, and `status` filters. |
| `POST` | `/api/items` | Manually create or ingest an Issue/PR item for triage. |
| `POST` | `/api/sync` | Fetch open Issues and PRs from a GitHub repository (`owner/repo`) via `httpx` and store them with initial triage metadata. |
| `PATCH` | `/api/items/{id}/triage` | Update AI triage summary, priority, suggested labels, or status for an item. |
