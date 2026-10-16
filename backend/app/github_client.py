import os
from typing import Any
import httpx


GITHUB_API_BASE = "https://api.github.com"


def generate_triage_insights(title: str, body: str | None, is_pr: bool, existing_labels: list[str]) -> dict[str, Any]:
    """Generate automated triage priority, summary, and label recommendations."""
    text = f"{title} {body or ''}".lower()

    if any(k in text for k in ("security", "vulnerability", "crash", "data loss", "memory leak", "cve", " deadlock")):
        priority = "critical"
    elif any(k in text for k in ("regression", "bug", "error", "exception", "fail", "broken", "timeout")):
        priority = "high"
    elif any(k in text for k in ("typo", "docs", "documentation", "readme", "nit", "chore")):
        priority = "low"
    else:
        priority = "medium"

    labels = list(existing_labels)
    if is_pr and "pull-request" not in labels:
        labels.append("needs-review")
    if "bug" in text and "bug" not in labels:
        labels.append("bug")
    if any(k in text for k in ("feature", "enhancement", "support", "proposal")) and "enhancement" not in labels:
        labels.append("enhancement")
    if any(k in text for k in ("docs", "documentation", "readme")) and "documentation" not in labels:
        labels.append("documentation")
    if not labels:
        labels.append("triage")

    kind_label = "Pull Request" if is_pr else "Issue"
    snippet = (body or "").strip().replace("\r", " ").replace("\n", " ")
    if len(snippet) > 140:
        snippet = snippet[:137] + "..."

    ai_summary = (
        f"AI Triage ({priority.upper()}): {kind_label} '{title}'. "
        f"{snippet if snippet else 'No additional body description provided; review title and linked context.'}"
    )

    return {
        "priority": priority,
        "suggested_labels": labels[:5],
        "ai_summary": ai_summary,
    }


async def fetch_github_repo_items(repo_full_name: str, limit: int = 5) -> list[dict[str, Any]]:
    """Fetch open issues and pull requests from GitHub REST API using httpx.AsyncClient."""
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "IssueLens-Triage-Dashboard/0.1.0",
    }
    github_token = os.getenv("GITHUB_TOKEN", "").strip()
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    url = f"{GITHUB_API_BASE}/repos/{repo_full_name}/issues"
    params = {"state": "open", "per_page": limit, "sort": "updated", "direction": "desc"}

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        response = await client.get(url, headers=headers, params=params)
        response.raise_for_status()
        raw_items = response.json()

    parsed_items: list[dict[str, Any]] = []
    for raw in raw_items:
        is_pr = "pull_request" in raw
        existing_labels = [lbl.get("name", "") for lbl in raw.get("labels", []) if lbl.get("name")]
        title = raw.get("title") or "Untitled"
        body = raw.get("body")
        insights = generate_triage_insights(title=title, body=body, is_pr=is_pr, existing_labels=existing_labels)

        parsed_items.append(
            {
                "repo_full_name": repo_full_name,
                "github_number": raw["number"],
                "item_type": "pr" if is_pr else "issue",
                "title": title,
                "body": body,
                "author": (raw.get("user") or {}).get("login", "unknown"),
                "html_url": raw.get("html_url", f"https://github.com/{repo_full_name}/issues/{raw['number']}"),
                "state": raw.get("state", "open"),
                "triage_status": "needs_triage",
                "priority": insights["priority"],
                "ai_summary": insights["ai_summary"],
                "suggested_labels": insights["suggested_labels"],
            }
        )

    return parsed_items
