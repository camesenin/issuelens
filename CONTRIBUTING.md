# Contributing to IssueLens

Thank you for your interest in contributing to **IssueLens**! Whether you are fixing a bug, improving AI triage prompts, enhancing the dashboard UI, or updating documentation, your contributions are welcome.

---

## Prerequisites

Before setting up the project locally, ensure you have the following installed:

- **Python 3.10+** (with `venv` and `pip`)
- **Node.js 18+** (with `npm`)
- **Git**

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/issuelens.git
cd issuelens
```

### 2. Backend Setup

Create and activate a Python virtual environment, install dependencies from `backend/requirements.txt`, configure your environment variables, and launch the FastAPI server with `uvicorn`:

```bash
# 1. Create a virtual environment
python -m venv .venv

# 2. Activate the virtual environment
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# On macOS / Linux:
source .venv/bin/activate

# 3. Install backend dependencies
pip install -r backend/requirements.txt

# 4. Copy the example environment file and add your keys
cp backend/.env.example backend/.env

# 5. Start the FastAPI server from the /backend directory
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend Setup

In a separate terminal window, install the frontend dependencies and start the Vite development server:

```bash
cd frontend
npm install
npm run dev
```

- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)

---

## Testing Guide

Backend unit and integration tests live in `backend/tests` and use `pytest` with an isolated in-memory SQLite database and mocked GitHub/Gemini API clients.

From the repository root (with your virtual environment activated), run:

```bash
pytest backend/tests
```

To run with verbose output:

```bash
pytest backend/tests -v
```

Please ensure all existing tests pass and add test coverage in `backend/tests/test_issuelens.py` for any new backend endpoints, schema changes, or triage logic before opening a Pull Request.

---

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main` (e.g., `git checkout -b feat/your-feature-name`).
2. **Make your changes**, adhering to existing code conventions:
   - **Backend**: Type-annotated Python 3.10+, SQLAlchemy 2.x `Mapped` models, and Pydantic v2 schemas.
   - **Frontend**: Modular React components styled with Tailwind CSS.
3. **Run the test suite** (`pytest backend/tests`) and verify the frontend builds cleanly (`cd frontend && npm run build`).
4. **Commit and push** your changes with a clear, descriptive commit message.
5. **Open a Pull Request** describing the motivation, changes made, and verification steps.
