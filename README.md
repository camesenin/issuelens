# IssueLens: AI-Powered Issue & PR Triage Dashboard for Open-Source Maintainers

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**IssueLens** is a full-stack triage and prioritization dashboard built for open-source maintainers. It connects to GitHub repositories, ingests open Issues and Pull Requests (including comments and unified PR diffs), and uses **Google Gemini (`google-genai`)** with deterministic fallback heuristics to detect missing reproduction steps, flag breaking changes, suggest labels, summarize threads, and draft maintainer-ready replies.

---

## Key Features

- **Unified Issue & PR Triage Queue**: Browse, search, and filter open GitHub Issues and Pull Requests by status (`Needs Repro`, `Breaking Change`, `PRs`, `Issues`).
- **Automated AI Triage & Structured Output**: Uses Google Gemini (`gemini-3.8-flash`) with Pydantic v2 structured output schemas (plus deterministic local heuristics when offline) to evaluate:
  - Missing reproduction steps, minimal code snippets, or error logs (`needs_repro`)
  - Potential breaking changes in public signatures or exported endpoints (`is_breaking`)
  - Unit test coverage in Pull Request diffs
  - Suggested GitHub labels (`bug`, `repro-needed`, `enhancement`, `good-first-issue`)
- **Maintainer Reply Drafting & 1-Click GitHub Posting**: Automatically drafts polite, context-aware responses that maintainers can edit and post directly back to GitHub Issues/PRs.
- **Live GitHub Repository Sync**: Asynchronously fetches open Issues, PRs, comments, and diffs via `httpx` and persists them in SQLite using SQLAlchemy 2.x.

---

## Quick Start

### 1. Backend (`/backend`)

```bash
# Create and activate a virtual environment (Python 3.10+)
python -m venv .venv
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

# Install Python dependencies
pip install -r backend/requirements.txt

# Configure environment variables
cp backend/.env.example backend/.env

# Start the FastAPI server
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend (`/frontend`)

```bash
# In a new terminal (Node.js 18+)
cd frontend
npm install
npm run dev
```

### 3. Run Tests

```bash
pytest backend/tests
```

Once running, access:
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API & Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

> **Docker Alternative**: Run `docker compose up --build` from the root directory to launch both services in containers.

---

## Architecture Breakdown

```text
issuelens/
├── backend/                     # FastAPI + SQLAlchemy 2.x + Pydantic v2 + Google GenAI
│   ├── tests/
│   │   └── test_issuelens.py    # Pytest suite (mocked GitHub sync, Gemini schema validation, API tests)
│   ├── main.py                  # FastAPI application, lifespan DB init/seeding, & REST endpoints
│   ├── database.py              # SQLAlchemy 2.x engine, session management, & ORM models
│   ├── schemas.py               # Pydantic v2 request/response validation schemas
│   ├── github_service.py        # Async httpx client for GitHub REST API (issues, comments, PR diffs)
│   ├── triage_service.py        # Gemini AI triage analyzer & deterministic diff/repro heuristics
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Environment variable template
│   └── Dockerfile
├── frontend/                    # React + Vite + Tailwind CSS + Lucide React
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx      # Repository switcher, GitHub sync input, & triage filters
│   │   │   ├── IssueCard.jsx    # Issue/PR summary card with triage badges & tags
│   │   │   └── TriageModal.jsx  # Detail drawer with AI summary, diff viewer, & reply editor
│   │   ├── App.jsx              # Main IssueLens Triage Dashboard controller
│   │   ├── main.jsx             # React DOM entry point
│   │   └── index.css            # Tailwind CSS directives & base styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── CONTRIBUTING.md              # Contributor setup, workflow, & testing guide
├── LICENSE                      # MIT License
├── docker-compose.yml
└── README.md
```

### Core Components

1. **Data Layer (`backend/database.py` & `backend/schemas.py`)**:
   - Uses SQLAlchemy 2.x typed `Mapped` declarative models (`Repository`, `Issue`, `TriageReport`) backed by SQLite (`issuelens.db` by default).
   - Validated end-to-end with Pydantic v2 schemas (`RepositoryRead`, `IssueRead`, `TriageReportRead`, `RepoSyncRequest`).
2. **GitHub Ingestion Service (`backend/github_service.py`)**:
   - Uses `httpx.AsyncClient` with bounded concurrency (`asyncio.Semaphore`) to fetch open issues, pull requests, issue comment threads, and unified PR diffs from the GitHub REST API, plus posting maintainer replies back to GitHub.
3. **AI Triage Engine (`backend/triage_service.py`)**:
   - Integrates the `google-genai` SDK (`client.interactions.create`) with a strict JSON schema (`TriageAnalysisSchema`) to classify issues and PRs.
   - Includes a deterministic fallback analyzer (`_fallback_analyze`) so the app and test suite work out-of-the-box even before API keys are configured.
4. **React Triage Dashboard (`frontend/src/`)**:
   - Provides a responsive developer dashboard built with React, Vite, Tailwind CSS, and `lucide-react` icons for syncing repositories, filtering queues, triggering on-demand AI re-triage, and posting drafted replies.

---

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` and configure your credentials:

```bash
cp backend/.env.example backend/.env
```

### `backend/.env`

```dotenv
GITHUB_TOKEN=your_personal_access_token_here
GEMINI_API_KEY=your_gemini_api_key_here
```

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `GITHUB_TOKEN` | Recommended (Required for posting replies) | `""` | GitHub Personal Access Token (`repo` or `public_repo` scope). Increases GitHub API rate limits during repository sync and authorizes `POST /api/issues/{id}/reply`. |
| `GEMINI_API_KEY` | Recommended | `""` | Google Gemini API key used by `google-genai` for AI issue/PR triage. If omitted, IssueLens gracefully falls back to built-in heuristic analysis. |
| `DATABASE_URL` | Optional | `sqlite:///./issuelens.db` | SQLAlchemy 2.x database connection string. |

### `frontend/.env` (Optional)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | Optional | `http://localhost:8000` | Base URL for the IssueLens FastAPI backend. |

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check returning service status. |
| `POST` | `/api/repos/sync` | Sync open Issues, PRs, comments, and diffs from a GitHub repository (`owner/name` or URL). |
| `GET` | `/api/repos` | List all synced GitHub repositories. |
| `GET` | `/api/repos/{repo_id}/issues` | List tracked Issues and PRs for a specific repository. |
| `GET` | `/api/issues` | List tracked Issues and PRs with optional `repo_id` and `is_pr` query filters. |
| `POST` | `/api/issues/{id}/triage` | Run (or re-run) AI triage analysis on an Issue or PR and persist its `TriageReport`. |
| `POST` | `/api/issues/{id}/reply` | Post the drafted (or custom) maintainer reply as a comment on GitHub. |

---

## Contributing & License

- See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing instructions.
- Distributed under the [MIT License](LICENSE).
