import os
import re
from typing import Literal

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import Issue, TriageReport

load_dotenv()

GEMINI_MODEL = "gemini-3.8-flash"

AllowedIssueLabel = Literal["bug", "repro-needed", "enhancement", "good-first-issue"]
ALLOWED_ISSUE_LABELS: tuple[str, ...] = (
    "bug",
    "repro-needed",
    "enhancement",
    "good-first-issue",
)


class TriageAnalysisSchema(BaseModel):
    """Structured output schema returned by the Gemini triage analyzer."""

    needs_repro: bool = Field(
        description=(
            "For issues: True if reproduction steps, code snippets, or error logs/tracebacks "
            "are missing from a bug report. For PRs: False unless reproduction/test verification is missing."
        )
    )
    is_breaking: bool = Field(
        description=(
            "For PRs: True if the diff modifies or removes public function signatures, "
            "exported classes/components, or API endpoints in a backward-incompatible way. "
            "For issues: False unless describing a breaking change."
        )
    )
    has_unit_tests: bool = Field(
        default=False,
        description=(
            "For PRs: True if unit test files (e.g., test_*.py, *_test.py, *.test.tsx, *.spec.ts) "
            "are included in the PR diff."
        ),
    )
    suggested_tags: list[str] = Field(
        description=(
            "Suggested GitHub labels. For issues, choose appropriate labels from "
            "['bug', 'repro-needed', 'enhancement', 'good-first-issue']."
        )
    )
    ai_summary: str = Field(
        description=(
            "Concise maintainer triage summary covering the core problem/change, "
            "whether repro steps or unit tests are present, and any breaking change risk."
        )
    )
    drafted_reply: str = Field(
        description=(
            "Polite, maintainer-ready response. If an issue is missing reproduction steps, code snippets, "
            "or error logs, politely request them. If a PR is missing unit tests or introduces breaking "
            "changes, mention those politely."
        )
    )


def _extract_diff_from_issue(issue: Issue) -> str:
    """Return the PR diff from issue.diff or extract it from issue.body if embedded."""
    if issue.diff:
        return issue.diff
    body = issue.body or ""
    match = re.search(r"### PR Diff\s*```diff\s*(.*?)\s*```", body, re.DOTALL)
    if match:
        return match.group(1)
    return ""


def detect_unit_tests_in_diff(diff_text: str) -> bool:
    """Check whether unit test files (e.g., test_*.py or *.test.tsx) appear in the PR diff."""
    if not diff_text:
        return False
    test_file_pattern = re.compile(
        r"(?:diff --git a/|\+\+\+ b/)[^\n]*?"
        r"(?:test_[\w.-]+\.py|[\w.-]+_test\.py|[\w.-]+\.(?:test|spec)\.(?:tsx|ts|jsx|js)|/tests?/)",
        re.IGNORECASE,
    )
    return bool(test_file_pattern.search(diff_text))


def detect_breaking_changes_in_diff(diff_text: str, title: str = "", body: str = "") -> bool:
    """Heuristic check for breaking changes in public function signatures or exported endpoints."""
    combined = f"{title}\n{body}".lower()
    if "breaking change" in combined or "breaking:" in combined or "!:" in title.lower():
        return True
    if not diff_text:
        return False

    # Look for removed or altered public function definitions, exported symbols, or route decorators
    removed_public_sig = re.compile(
        r"^-\s*(?:async\s+)?def\s+(?!_)[a-zA-Z0-9_]+\s*\("
        r"|^-\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|interface|type)\s+[a-zA-Z0-9_]+"
        r"|^-\s*@(?:app|router)\.(?:get|post|put|delete|patch)\s*\(",
        re.MULTILINE,
    )
    return bool(removed_public_sig.search(diff_text))


def detect_missing_repro_in_issue(title: str, body: str) -> tuple[bool, bool]:
    """Return (is_bug_like, needs_repro) by inspecting issue title and markdown body."""
    text = f"{title}\n{body}".lower()
    is_bug_like = any(
        kw in text
        for kw in (
            "bug",
            "error",
            "exception",
            "crash",
            "fail",
            "broken",
            "issue",
            "doesn't work",
            "does not work",
            "unexpected",
            "regression",
            "leak",
        )
    )
    is_enhancement = any(
        kw in text for kw in ("feature", "enhancement", "proposal", "request", "support for", "add ")
    )
    if is_enhancement and not is_bug_like:
        return False, False

    has_code_block = "```" in body or "    " in body
    has_repro_steps = any(
        marker in text
        for marker in (
            "steps to reproduce",
            "reproduction",
            "repro",
            "to reproduce",
            "1.",
            "step 1",
            "minimal reproducible",
        )
    )
    has_error_logs = any(
        err in text
        for err in (
            "traceback",
            "stack trace",
            "error:",
            "exception:",
            "at ",
            "file \"",
            "status code",
        )
    )

    # Reproduction details are considered missing if a bug report lacks repro steps AND lacks code/error logs
    needs_repro = not (has_repro_steps or (has_code_block and has_error_logs))
    return True, needs_repro


def _build_Prompt_for_issue(issue: Issue) -> str:
    body = issue.body or "(No description provided)"
    return (
        "You are an expert open-source maintainer triaging a GitHub Issue.\n\n"
        f"Issue #{issue.github_issue_id}: {issue.title}\n"
        f"Author: @{issue.author}\n\n"
        f"Markdown Body:\n{body}\n\n"
        "Instructions:\n"
        "1. Inspect the issue title and markdown body.\n"
        "2. Detect if reproduction steps, code snippets, or error logs are missing (set `needs_repro` accordingly).\n"
        "3. Suggest appropriate GitHub labels exclusively from: "
        '["bug", "repro-needed", "enhancement", "good-first-issue"]. '
        "Include 'repro-needed' whenever `needs_repro` is True.\n"
        "4. Write a concise `ai_summary` for maintainers.\n"
        "5. Draft a polite, maintainer-ready canned response (`drafted_reply`) requesting the specific missing "
        "reproduction steps, minimal code snippet, or error logs if `needs_repro` is True, or acknowledging the report."
    )


def _build_prompt_for_pr(issue: Issue, diff_text: str, has_tests: bool, heuristic_breaking: bool) -> str:
    body = issue.body or "(No description provided)"
    return (
        "You are an expert open-source maintainer reviewing and triaging a GitHub Pull Request.\n\n"
        f"PR #{issue.github_issue_id}: {issue.title}\n"
        f"Author: @{issue.author}\n"
        f"Heuristic unit test file detected in diff: {has_tests}\n"
        f"Heuristic public signature/endpoint change detected: {heuristic_breaking}\n\n"
        f"PR Description:\n{body}\n\n"
        f"PR Diff:\n```diff\n{diff_text or '(No diff available)'}\n```\n\n"
        "Instructions:\n"
        "1. Inspect the PR diff.\n"
        "2. Detect potential breaking changes in public function signatures or exported endpoints (`is_breaking`).\n"
        "3. Check if unit test files (e.g., `test_*.py` or `*.test.tsx`) are included in the diff (`has_unit_tests`).\n"
        "4. Suggest appropriate labels (chosen from ['bug', 'repro-needed', 'enhancement', 'good-first-issue'] "
        "plus relevant PR tags if needed).\n"
        "5. Write a concise `ai_summary` explicitly stating whether breaking changes were detected and whether "
        "unit test files are included in the diff.\n"
        "6. Draft a polite, maintainer-ready review response (`drafted_reply`) addressing test coverage and "
        "any breaking change considerations."
    )


def _fallback_analyze(issue: Issue) -> TriageAnalysisSchema:
    """Deterministic fallback triage analysis when GEMINI_API_KEY is not configured or unreachable."""
    title = issue.title or ""
    body = issue.body or ""

    if issue.is_pr:
        diff_text = _extract_diff_from_issue(issue)
        has_tests = detect_unit_tests_in_diff(diff_text)
        is_breaking = detect_breaking_changes_in_diff(diff_text, title=title, body=body)
        tags: list[str] = []
        lower_text = f"{title} {body}".lower()
        if any(k in lower_text for k in ("fix", "bug", "patch", "resolve")):
            tags.append("bug")
        else:
            tags.append("enhancement")
        if not has_tests:
            tags.append("repro-needed")

        test_status = (
            "Unit test files are included in the diff."
            if has_tests
            else "No unit test files (e.g., test_*.py or *.test.tsx) were detected in the diff."
        )
        breaking_status = (
            "Potential breaking changes detected in public function signatures or exported endpoints."
            if is_breaking
            else "No breaking changes in public function signatures or exported endpoints detected."
        )
        ai_summary = f"PR Triage Summary: {breaking_status} {test_status}"

        reply_parts = [f"Thanks for submitting this pull request, @{issue.author}!"]
        if is_breaking:
            reply_parts.append(
                "We noticed changes to public function signatures or exported endpoints that could be breaking—"
                "could you confirm whether backward compatibility is preserved or document the migration path?"
            )
        if not has_tests:
            reply_parts.append(
                "Could you also add unit tests (e.g., `test_*.py` or `*.test.tsx`) covering these changes so we can merge with confidence?"
            )
        if not is_breaking and has_tests:
            reply_parts.append(
                "The diff includes test coverage and appears backward-compatible. A maintainer will complete a final review shortly."
            )

        return TriageAnalysisSchema(
            needs_repro=not has_tests,
            is_breaking=is_breaking,
            has_unit_tests=has_tests,
            suggested_tags=tags,
            ai_summary=ai_summary,
            drafted_reply=" ".join(reply_parts),
        )

    # Issue analysis
    is_bug_like, needs_repro = detect_missing_repro_in_issue(title=title, body=body)
    tags = []
    if is_bug_like:
        tags.append("bug")
        if needs_repro:
            tags.append("repro-needed")
    else:
        tags.append("enhancement")

    lower_text = f"{title} {body}".lower()
    if any(k in lower_text for k in ("typo", "docs", "documentation", "good first issue", "beginner", "minor")):
        tags.append("good-first-issue")

    if needs_repro:
        ai_summary = (
            f"Issue reports a problem ('{title}'), but is missing reproduction steps, "
            "minimal code snippets, or error logs/tracebacks."
        )
        drafted_reply = (
            f"Hi @{issue.author}, thanks for opening this issue! To help us investigate and resolve this quickly, "
            "could you please provide:\n"
            "1. Step-by-step reproduction instructions\n"
            "2. A minimal reproducible code snippet\n"
            "3. Full error logs or stack tracebacks (plus your environment/version details)\n\n"
            "Once added, we'll be happy to take a closer look!"
        )
    else:
        ai_summary = (
            f"Issue '{title}' includes sufficient context/reproduction details and is ready for maintainer review."
        )
        drafted_reply = (
            f"Thanks for the detailed report, @{issue.author}! We have the context needed to investigate and "
            "have queued this issue for maintainer review."
        )

    return TriageAnalysisSchema(
        needs_repro=needs_repro,
        is_breaking=False,
        has_unit_tests=False,
        suggested_tags=tags,
        ai_summary=ai_summary,
        drafted_reply=drafted_reply,
    )


def analyze_issue_or_pr_with_gemini(issue: Issue) -> TriageAnalysisSchema:
    """Run AI triage analysis on an Issue or Pull Request using the Google GenAI Interactions API."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_gemini_api_key_here":
        return _fallback_analyze(issue)

    diff_text = _extract_diff_from_issue(issue) if issue.is_pr else ""
    has_tests = detect_unit_tests_in_diff(diff_text) if issue.is_pr else False
    heuristic_breaking = (
        detect_breaking_changes_in_diff(diff_text, title=issue.title or "", body=issue.body or "")
        if issue.is_pr
        else False
    )

    prompt = (
        _build_prompt_for_pr(issue, diff_text, has_tests, heuristic_breaking)
        if issue.is_pr
        else _build_Prompt_for_issue(issue)
    )

    try:
        client = genai.Client(api_key=api_key)
        interaction = client.interactions.create(
            model=GEMINI_MODEL,
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": TriageAnalysisSchema.model_json_schema(),
            },
        )
        result = TriageAnalysisSchema.model_validate_json(interaction.output_text)

        # Normalize suggested_tags for issues to the allowed label set if empty or invalid
        if not issue.is_pr:
            filtered = [t for t in result.suggested_tags if t in ALLOWED_ISSUE_LABELS]
            if result.needs_repro and "repro-needed" not in filtered:
                filtered.append("repro-needed")
            if not filtered:
                filtered = ["bug", "repro-needed"] if result.needs_repro else ["enhancement"]
            result.suggested_tags = filtered

        return result
    except Exception:
        return _fallback_analyze(issue)


def run_triage_for_issue(db: Session, issue: Issue) -> TriageReport:
    """Analyze an Issue or PR via Gemini and create or update its TriageReport in SQLite."""
    analysis = analyze_issue_or_pr_with_gemini(issue)

    report = db.scalar(select(TriageReport).where(TriageReport.issue_id == issue.id))
    if report is None:
        report = TriageReport(
            issue_id=issue.id,
            needs_repro=analysis.needs_repro,
            is_breaking=analysis.is_breaking,
            suggested_tags=analysis.suggested_tags,
            ai_summary=analysis.ai_summary,
            drafted_reply=analysis.drafted_reply,
        )
        db.add(report)
    else:
        report.needs_repro = analysis.needs_repro
        report.is_breaking = analysis.is_breaking
        report.suggested_tags = analysis.suggested_tags
        report.ai_summary = analysis.ai_summary
        report.drafted_reply = analysis.drafted_reply

    db.commit()
    db.refresh(report)
    return report
