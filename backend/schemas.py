from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RepoSyncRequest(BaseModel):
    repo_url: str = Field(
        ...,
        min_length=3,
        examples=["https://github.com/fastapi/fastapi", "pallets/flask"],
        description="GitHub repository URL or 'owner/name' identifier.",
    )


class IssueReplyRequest(BaseModel):
    body: str | None = Field(
        default=None,
        description="Optional override for the comment body. Defaults to TriageReport.drafted_reply.",
    )
    reply: str | None = Field(
        default=None,
        description="Optional alias for the comment body.",
    )


class IssueReplyResponse(BaseModel):
    issue_id: int
    github_issue_id: int
    posted_body: str
    comment_url: str | None = None
    github_comment_id: int | None = None


class TriageReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    issue_id: int
    needs_repro: bool
    is_breaking: bool
    suggested_tags: list[str] = Field(default_factory=list)
    ai_summary: str | None = None
    drafted_reply: str | None = None


class RepositoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner: str
    name: str
    scanned_at: datetime | None = None


class IssueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repo_id: int
    github_issue_id: int
    title: str
    body: str | None = None
    author: str
    is_pr: bool
    state: str
    created_at: datetime
    diff: str | None = None
    comments: list[dict[str, Any]] | None = None
    triage_report: TriageReportRead | None = None
    repository: RepositoryRead | None = None


class RepoSyncResponse(BaseModel):
    repository: RepositoryRead
    synced_count: int
    issues: list[IssueRead]
