from contextlib import asynccontextmanager
from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from database import Issue, Repository, SessionLocal, TriageReport, get_db, init_db
from github_service import post_issue_comment, sync_repository_issues
from schemas import (
    IssueRead,
    IssueReplyRequest,
    IssueReplyResponse,
    RepoSyncRequest,
    RepoSyncResponse,
    RepositoryRead,
    TriageReportRead,
)
from triage_service import run_triage_for_issue


def _seed_demo_data_if_empty() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(Repository.id).limit(1))
        if existing is not None:
            return

        repo = Repository(owner="facebook", name="react")
        db.add(repo)
        db.flush()

        issue1 = Issue(
            repo_id=repo.id,
            github_issue_id=31842,
            title="useEffect cleanup runs twice in production build when hydrating Suspense boundary",
            body=(
                "## Summary\n\n"
                "After upgrading our app to React 19, we noticed our WebSocket connection inside `useEffect` "
                "disconnects and reconnects unexpectedly during SSR hydration.\n\n"
                "It happens intermittently on pages using nested `<Suspense>` boundaries, "
                "but I don't have a minimal reproduction repository or stack trace yet."
            ),
            author="dan-dev",
            is_pr=False,
            state="open",
        )
        issue2 = Issue(
            repo_id=repo.id,
            github_issue_id=31850,
            title="refactor(scheduler): remove legacy unstable_scheduleCallback priority parameter",
            body=(
                "## Summary\n\n"
                "Removes the deprecated `options.timeout` signature from `unstable_scheduleCallback` "
                "and updates the exported scheduler entrypoints.\n\n"
                "### PR Diff\n"
                "```diff\n"
                "diff --git a/packages/scheduler/src/forks/Scheduler.js b/packages/scheduler/src/forks/Scheduler.js\n"
                "--- a/packages/scheduler/src/forks/Scheduler.js\n"
                "+++ b/packages/scheduler/src/forks/Scheduler.js\n"
                "-export function unstable_scheduleCallback(priorityLevel, callback, options) {\n"
                "+export function unstable_scheduleCallback(priorityLevel, callback) {\n"
                "   var currentTime = getCurrentTime();\n"
                "   var startTime = currentTime;\n"
                " }\n"
                "```"
            ),
            author="scheduler-contrib",
            is_pr=True,
            state="open",
            diff=(
                "diff --git a/packages/scheduler/src/forks/Scheduler.js b/packages/scheduler/src/forks/Scheduler.js\n"
                "--- a/packages/scheduler/src/forks/Scheduler.js\n"
                "+++ b/packages/scheduler/src/forks/Scheduler.js\n"
                "-export function unstable_scheduleCallback(priorityLevel, callback, options) {\n"
                "+export function unstable_scheduleCallback(priorityLevel, callback) {\n"
            ),
        )
        issue3 = Issue(
            repo_id=repo.id,
            github_issue_id=31859,
            title="feat(devtools): highlight memoized server components in Profiler flamegraph",
            body=(
                "## Summary\n\n"
                "Adds a subtle badge in the React DevTools Profiler flamegraph for Server Components "
                "that were skipped during re-render.\n\n"
                "### Steps to Verify\n"
                "1. Open React DevTools Profiler\n"
                "2. Record a transition\n"
                "3. Inspect the `ServerComponent.test.tsx` suite\n\n"
                "### PR Diff\n"
                "```diff\n"
                "diff --git a/packages/react-devtools-shared/src/__tests__/ServerComponent.test.tsx b/packages/react-devtools-shared/src/__tests__/ServerComponent.test.tsx\n"
                "+++ b/packages/react-devtools-shared/src/__tests__/ServerComponent.test.tsx\n"
                "+it('renders memoized server component badge in flamegraph', () => {\n"
                "+  expect(true).toBe(true);\n"
                "+});\n"
                "```"
            ),
            author="devtools-maintainer",
            is_pr=True,
            state="open",
            diff=(
                "diff --git a/packages/react-devtools-shared/src/__tests__/ServerComponent.test.tsx b/packages/react-devtools-shared/src/__tests__/ServerComponent.test.tsx\n"
                "+++ b/packages/react-devtools-shared/src/__tests__/ServerComponent.test.tsx\n"
            ),
        )

        db.add_all([issue1, issue2, issue3])
        db.flush()

        db.add_all(
            [
                TriageReport(
                    issue_id=issue1.id,
                    needs_repro=True,
                    is_breaking=False,
                    suggested_tags=["bug", "repro-needed"],
                    ai_summary=(
                        "Bug report regarding `useEffect` cleanup running twice during Suspense SSR hydration, "
                        "but missing reproduction steps, minimal code snippet, and error logs."
                    ),
                    drafted_reply=(
                        "Hi @dan-dev, thanks for reporting this! Because Suspense hydration timing depends heavily "
                        "on your streaming setup, could you please share:\n"
                        "1. A minimal CodeSandbox or GitHub reproduction repository\n"
                        "2. The exact React & ReactDOM versions used\n"
                        "3. Any hydration warnings or console logs\n\n"
                        "Once we have a minimal repro, we'll gladly investigate!"
                    ),
                ),
                TriageReport(
                    issue_id=issue2.id,
                    needs_repro=True,
                    is_breaking=True,
                    suggested_tags=["bug", "repro-needed"],
                    ai_summary=(
                        "PR modifies the exported `unstable_scheduleCallback` function signature by removing the "
                        "`options` parameter (potential breaking change) and does not include unit test updates in the diff."
                    ),
                    drafted_reply=(
                        "Thanks for the PR, @scheduler-contrib! Two quick items from our automated triage review:\n"
                        "1. **Breaking Signature Change**: Removing `options` from `unstable_scheduleCallback` changes an "
                        "exported function signature used by downstream packages.\n"
                        "2. **Missing Unit Tests**: No test files (`*.test.js` / `*.test.tsx`) were modified in this diff. "
                        "Could you add regression tests covering delayed scheduling?"
                    ),
                ),
                TriageReport(
                    issue_id=issue3.id,
                    needs_repro=False,
                    is_breaking=False,
                    suggested_tags=["enhancement", "good-first-issue"],
                    ai_summary=(
                        "Enhancement PR adding Profiler flamegraph badges for memoized Server Components. "
                        "No breaking signature changes detected, and unit tests (`ServerComponent.test.tsx`) are included."
                    ),
                    drafted_reply=(
                        "Thanks @devtools-maintainer! The implementation looks clean, backward-compatible, and includes "
                        "`ServerComponent.test.tsx` coverage. Queued for maintainer sign-off."
                    ),
                ),
            ]
        )
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    _seed_demo_data_if_empty()
    yield


app = FastAPI(
    title="IssueLens API",
    description="AI-Powered Issue & PR Triage Dashboard for Open-Source Maintainers",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "issuelens-backend"}


@app.post("/api/repos/sync", response_model=RepoSyncResponse)
async def sync_repo(
    payload: RepoSyncRequest,
    db: Session = Depends(get_db),
) -> RepoSyncResponse:
    try:
        repo, synced_issues = await sync_repository_issues(
            db=db,
            repo_url=payload.repo_url,
            limit=20,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"GitHub API error ({exc.response.status_code}) while syncing '{payload.repo_url}'",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with GitHub API: {exc}",
        ) from exc

    return RepoSyncResponse(
        repository=repo,
        synced_count=len(synced_issues),
        issues=synced_issues,
    )


@app.get("/api/repos", response_model=list[RepositoryRead])
def list_repositories(db: Session = Depends(get_db)) -> list[Repository]:
    stmt = select(Repository).order_by(Repository.scanned_at.desc(), Repository.id.desc())
    return list(db.scalars(stmt).all())


@app.get("/api/repos/{repo_id}/issues", response_model=list[IssueRead])
def list_repository_issues(repo_id: int, db: Session = Depends(get_db)) -> list[Issue]:
    repo = db.get(Repository, repo_id)
    if repo is None:
        raise HTTPException(status_code=404, detail=f"Repository {repo_id} not found")
    stmt = (
        select(Issue)
        .options(selectinload(Issue.triage_report), selectinload(Issue.repository))
        .where(Issue.repo_id == repo_id)
        .order_by(Issue.created_at.desc(), Issue.id.desc())
    )
    return list(db.scalars(stmt).all())


@app.get("/api/issues", response_model=list[IssueRead])
def list_issues(
    repo_id: int | None = None,
    is_pr: bool | None = None,
    db: Session = Depends(get_db),
) -> list[Issue]:
    stmt = (
        select(Issue)
        .options(selectinload(Issue.triage_report), selectinload(Issue.repository))
        .order_by(Issue.created_at.desc(), Issue.id.desc())
    )
    if repo_id is not None:
        stmt = stmt.where(Issue.repo_id == repo_id)
    if is_pr is not None:
        stmt = stmt.where(Issue.is_pr == is_pr)
    return list(db.scalars(stmt).all())


@app.post("/api/issues/{id}/triage", response_model=TriageReportRead)
def triage_issue_endpoint(
    id: int,
    db: Session = Depends(get_db),
) -> TriageReport:
    issue = db.scalar(
        select(Issue)
        .options(selectinload(Issue.triage_report), selectinload(Issue.repository))
        .where(Issue.id == id)
    )
    if issue is None:
        raise HTTPException(status_code=404, detail=f"Issue {id} not found")

    report = run_triage_for_issue(db=db, issue=issue)
    return report


@app.post("/api/issues/{id}/reply", response_model=IssueReplyResponse)
async def reply_to_issue_endpoint(
    id: int,
    payload: IssueReplyRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> IssueReplyResponse:
    issue = db.scalar(
        select(Issue)
        .options(selectinload(Issue.triage_report), selectinload(Issue.repository))
        .where(Issue.id == id)
    )
    if issue is None:
        raise HTTPException(status_code=404, detail=f"Issue {id} not found")

    if issue.repository is None:
        raise HTTPException(status_code=400, detail=f"Repository for issue {id} not found")

    custom_body = (payload.body or payload.reply) if payload else None
    reply_text = (custom_body or (issue.triage_report.drafted_reply if issue.triage_report else "") or "").strip()

    if not reply_text:
        raise HTTPException(
            status_code=400,
            detail="No drafted reply available for this issue. Run POST /api/issues/{id}/triage first or provide a reply body.",
        )

    try:
        gh_comment = await post_issue_comment(
            owner=issue.repository.owner,
            name=issue.repository.name,
            github_issue_id=issue.github_issue_id,
            body=reply_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"GitHub API error ({exc.response.status_code}) while posting comment",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with GitHub API: {exc}",
        ) from exc

    if issue.triage_report and custom_body:
        issue.triage_report.drafted_reply = reply_text
        db.commit()

    return IssueReplyResponse(
        issue_id=issue.id,
        github_issue_id=issue.github_issue_id,
        posted_body=reply_text,
        comment_url=gh_comment.get("html_url"),
        github_comment_id=gh_comment.get("id"),
    )
