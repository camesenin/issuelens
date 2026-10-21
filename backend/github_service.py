import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import Issue, Repository, utc_now

load_dotenv()

GITHUB_API_BASE = "https://api.github.com"
MAX_DIFF_CHARS = 15000


def parse_repo_url(repo_url: str) -> tuple[str, str]:
    """Extract (owner, name) from a GitHub repository URL or 'owner/name' string."""
    cleaned = repo_url.strip().rstrip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4].rstrip("/")

    if "://" in cleaned or cleaned.startswith("github.com/"):
        parsed = urlparse(cleaned if "://" in cleaned else f"https://{cleaned}")
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if len(parts) >= 2:
            return parts[0], parts[1]
        raise ValueError(f"Invalid GitHub repository URL: '{repo_url}'")

    match = re.match(r"^([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$", cleaned)
    if match:
        return match.group(1), match.group(2)

    raise ValueError(
        f"Invalid repository identifier '{repo_url}'. Expected 'owner/name' or a GitHub URL."
    )


def _build_github_headers(accept: str = "application/vnd.github+json") -> dict[str, str]:
    headers = {
        "Accept": accept,
        "User-Agent": "IssueLens-Triage-Dashboard/0.1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token and token not in ("your_github_token_here", "your_personal_access_token_here"):
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _parse_github_datetime(value: str | None) -> datetime:
    if not value:
        return utc_now()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return utc_now()


async def _fetch_issue_comments(
    client: httpx.AsyncClient,
    owner: str,
    name: str,
    issue_number: int,
    comments_url: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch comments for a specific GitHub issue or PR."""
    url = comments_url or f"{GITHUB_API_BASE}/repos/{owner}/{name}/issues/{issue_number}/comments"
    try:
        resp = await client.get(
            url,
            headers=_build_github_headers(),
            params={"per_page": 20},
        )
        if resp.status_code != 200:
            return []
        raw_comments = resp.json()
        if not isinstance(raw_comments, list):
            return []
        return [
            {
                "id": c.get("id"),
                "author": (c.get("user") or {}).get("login") or "unknown",
                "body": c.get("body") or "",
                "created_at": c.get("created_at"),
            }
            for c in raw_comments
        ]
    except httpx.HTTPError:
        return []


async def _fetch_pr_diff(
    client: httpx.AsyncClient,
    owner: str,
    name: str,
    pr_number: int,
) -> str | None:
    """Fetch unified diff for a specific GitHub Pull Request."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{name}/pulls/{pr_number}"
    try:
        resp = await client.get(
            url,
            headers=_build_github_headers(accept="application/vnd.github.v3.diff"),
        )
        if resp.status_code != 200:
            return None
        diff_text = resp.text or ""
        if len(diff_text) > MAX_DIFF_CHARS:
            return diff_text[:MAX_DIFF_CHARS] + "\n... [diff truncated]"
        return diff_text
    except httpx.HTTPError:
        return None


def _compose_enriched_body(
    raw_body: str | None,
    comments: list[dict[str, Any]],
    diff_text: str | None,
) -> str:
    """Combine original body with fetched comments and PR diff so all context is persisted."""
    sections: list[str] = [(raw_body or "").strip()]

    if comments:
        comment_lines = [
            f"- @{c.get('author', 'unknown')}: {(c.get('body') or '').strip()}"
            for c in comments
            if (c.get("body") or "").strip()
        ]
        if comment_lines:
            sections.append("### Comments\n" + "\n".join(comment_lines))

    if diff_text:
        sections.append(f"### PR Diff\n```diff\n{diff_text.strip()}\n```")

    return "\n\n".join(s for s in sections if s)


async def fetch_recent_issues_and_prs(
    repo_url: str,
    limit: int = 20,
) -> tuple[str, str, list[dict[str, Any]]]:
    """Fetch the 20 most recent open issues and PRs (including diffs and comments) from GitHub."""
    owner, name = parse_repo_url(repo_url)
    issues_url = f"{GITHUB_API_BASE}/repos/{owner}/{name}/issues"
    params = {
        "state": "open",
        "per_page": limit,
        "sort": "created",
        "direction": "desc",
    }

    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        response = await client.get(
            issues_url,
            headers=_build_github_headers(),
            params=params,
        )
        response.raise_for_status()
        raw_items = response.json()

        async def enrich_item(raw: dict[str, Any]) -> dict[str, Any]:
            issue_number = raw.get("number") or raw.get("id")
            is_pr = "pull_request" in raw
            comments_count = raw.get("comments", 1)

            async with semaphore:
                if comments_count and comments_count > 0:
                    comments_task = _fetch_issue_comments(
                        client,
                        owner,
                        name,
                        issue_number,
                        comments_url=raw.get("comments_url"),
                    )
                else:
                    comments_task = asyncio.sleep(0, result=[])

                if is_pr and issue_number is not None:
                    diff_task = _fetch_pr_diff(client, owner, name, issue_number)
                else:
                    diff_task = asyncio.sleep(0, result=None)

                comments, diff_text = await asyncio.gather(comments_task, diff_task)

            raw_body = raw.get("body")
            enriched_body = _compose_enriched_body(raw_body, comments, diff_text)

            return {
                "github_issue_id": int(issue_number),
                "title": raw.get("title") or "Untitled",
                "body": enriched_body,
                "author": (raw.get("user") or {}).get("login") or "unknown",
                "is_pr": is_pr,
                "state": raw.get("state") or "open",
                "created_at": _parse_github_datetime(raw.get("created_at")),
                "diff": diff_text,
                "comments": comments,
            }

        enriched_items = await asyncio.gather(*(enrich_item(item) for item in raw_items[:limit]))

    return owner, name, list(enriched_items)


async def sync_repository_issues(
    db: Session,
    repo_url: str,
    limit: int = 20,
) -> tuple[Repository, list[Issue]]:
    """Fetch the 20 most recent open issues & PRs from GitHub and store/update them in SQLite."""
    owner, name, fetched_items = await fetch_recent_issues_and_prs(repo_url=repo_url, limit=limit)

    repo = db.scalar(
        select(Repository).where(
            Repository.owner.ilike(owner),
            Repository.name.ilike(name),
        )
    )
    if repo is None:
        repo = Repository(owner=owner, name=name, scanned_at=utc_now())
        db.add(repo)
        db.flush()
    else:
        repo.owner = owner
        repo.name = name
        repo.scanned_at = utc_now()
        db.flush()

    synced_issues: list[Issue] = []
    for item_data in fetched_items:
        existing_issue = db.scalar(
            select(Issue).where(
                Issue.repo_id == repo.id,
                Issue.github_issue_id == item_data["github_issue_id"],
            )
        )
        if existing_issue is not None:
            existing_issue.title = item_data["title"]
            existing_issue.body = item_data["body"]
            existing_issue.author = item_data["author"]
            existing_issue.is_pr = item_data["is_pr"]
            existing_issue.state = item_data["state"]
            existing_issue.created_at = item_data["created_at"]
            existing_issue.diff = item_data["diff"]
            existing_issue.comments = item_data["comments"]
            synced_issues.append(existing_issue)
        else:
            new_issue = Issue(
                repo_id=repo.id,
                github_issue_id=item_data["github_issue_id"],
                title=item_data["title"],
                body=item_data["body"],
                author=item_data["author"],
                is_pr=item_data["is_pr"],
                state=item_data["state"],
                created_at=item_data["created_at"],
                diff=item_data["diff"],
                comments=item_data["comments"],
            )
            db.add(new_issue)
            synced_issues.append(new_issue)

    db.commit()
    db.refresh(repo)

    from triage_service import _fallback_analyze
    from database import TriageReport

    for issue in synced_issues:
        db.refresh(issue)
        existing_report = db.scalar(
            select(TriageReport).where(TriageReport.issue_id == issue.id)
        )
        if existing_report is None:
            analysis = _fallback_analyze(issue)
            issue.bounty_xlm = analysis.bounty_xlm
            if issue.bounty_status not in ("escrowed", "paid"):
                issue.bounty_status = "escrowed"
            db.add(
                TriageReport(
                    issue_id=issue.id,
                    needs_repro=analysis.needs_repro,
                    is_breaking=analysis.is_breaking,
                    suggested_tags=analysis.suggested_tags,
                    ai_summary=analysis.ai_summary,
                    drafted_reply=analysis.drafted_reply,
                    complexity=analysis.complexity,
                    bounty_xlm=analysis.bounty_xlm,
                )
            )
    db.commit()
    for issue in synced_issues:
        db.refresh(issue)

    return repo, synced_issues


async def post_issue_comment(
    owner: str,
    name: str,
    github_issue_id: int,
    body: str,
) -> dict[str, Any]:
    """Post a maintainer comment/reply directly to a GitHub issue or PR via the GitHub REST API."""
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token or token in ("your_github_token_here", "your_personal_access_token_here"):
        raise ValueError(
            "GITHUB_TOKEN is not configured. Set a valid GITHUB_TOKEN in your environment to post replies to GitHub."
        )

    url = f"{GITHUB_API_BASE}/repos/{owner}/{name}/issues/{github_issue_id}/comments"
    headers = _build_github_headers()

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        response = await client.post(url, headers=headers, json={"body": body})
        response.raise_for_status()
        return response.json()

