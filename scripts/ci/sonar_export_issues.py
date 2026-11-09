#!/usr/bin/env python3
"""Export unresolved SonarQube issues to CSV (paginated, Bearer auth).

Moved out of the Jenkinsfile inline string. Env: SONAR_URL, SONAR_PROJECT_KEY,
SONAR_TOKEN, SONAR_OUTPUT (default sonarqube-issues.csv).
"""
import csv
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SONAR_URL = os.getenv("SONAR_URL", "").rstrip("/")
PROJECT_KEY = os.getenv("SONAR_PROJECT_KEY", "")
SONAR_TOKEN = os.getenv("SONAR_TOKEN", "")
OUTPUT_FILE = os.getenv("SONAR_OUTPUT", "sonarqube-issues.csv")
PAGE_SIZE = 500
# SonarQube /api/issues/search hard limit: p * ps <= 10000
MAX_RESULTS = 10000


def require_environment() -> None:
    missing = [n for n, v in (("SONAR_URL", SONAR_URL),
                              ("SONAR_PROJECT_KEY", PROJECT_KEY),
                              ("SONAR_TOKEN", SONAR_TOKEN)) if not v]
    if missing:
        print("Thieu bien moi truong: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)


def api_get(path: str, parameters: dict) -> dict:
    url = f"{SONAR_URL}{path}?{urlencode(parameters)}"
    request = Request(url, method="GET", headers={
        "Authorization": f"Bearer {SONAR_TOKEN}",
        "Accept": "application/json",
    })
    try:
        with urlopen(request, timeout=60) as response:
            return json.load(response)
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        print(f"SonarQube tra ve HTTP {error.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except URLError as error:
        print(f"Khong ket noi duoc SonarQube: {error}", file=sys.stderr)
        sys.exit(1)


def format_impacts(impacts: list) -> str:
    values = []
    for impact in impacts:
        quality = impact.get("softwareQuality", "")
        severity = impact.get("severity", "")
        if quality or severity:
            values.append(f"{quality}:{severity}".strip(":"))
    return "; ".join(values)


def fetch_all_issues() -> list:
    all_issues: list = []
    page = 1
    while True:
        payload = api_get("/api/issues/search", {
            "componentKeys": PROJECT_KEY,
            "resolved": "false",
            "p": page,
            "ps": PAGE_SIZE,
        })
        current = payload.get("issues", [])
        total = int(payload.get("paging", {}).get("total", 0))
        all_issues.extend(current)
        print(f"Da lay {len(all_issues)}/{total} issues", file=sys.stderr)
        if not current or len(all_issues) >= min(total, MAX_RESULTS):
            break
        page += 1
    return all_issues


COLUMNS = [
    "issue_key", "type", "severity", "impacts", "clean_code_attribute",
    "status", "resolution", "rule", "project", "component", "line",
    "message", "effort", "debt", "author", "assignee", "tags",
    "creation_date", "update_date",
]


def export_csv(issues: list) -> None:
    os.makedirs(os.path.dirname(OUTPUT_FILE) or ".", exist_ok=True)
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=COLUMNS)
        writer.writeheader()
        for issue in issues:
            writer.writerow({
                "issue_key": issue.get("key", ""),
                "type": issue.get("type", ""),
                "severity": issue.get("severity", ""),
                "impacts": format_impacts(issue.get("impacts", [])),
                "clean_code_attribute": issue.get("cleanCodeAttribute", ""),
                "status": issue.get("status", ""),
                "resolution": issue.get("resolution", ""),
                "rule": issue.get("rule", ""),
                "project": issue.get("project", ""),
                "component": issue.get("component", ""),
                "line": issue.get("line", ""),
                "message": issue.get("message", ""),
                "effort": issue.get("effort", ""),
                "debt": issue.get("debt", ""),
                "author": issue.get("author", ""),
                "assignee": issue.get("assignee", ""),
                "tags": "; ".join(issue.get("tags", [])),
                "creation_date": issue.get("creationDate", ""),
                "update_date": issue.get("updateDate", ""),
            })


def main() -> None:
    require_environment()
    issues = fetch_all_issues()
    export_csv(issues)
    print(f"Hoan thanh: {OUTPUT_FILE}")
    print(f"Tong so issue da xuat: {len(issues)}")


if __name__ == "__main__":
    main()
