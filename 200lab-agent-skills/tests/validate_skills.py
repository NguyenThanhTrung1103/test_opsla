#!/usr/bin/env python3
"""
Test Suite: Validate 200Lab Agent Skills Metadata, Structure & Standards
"""

import os
import sys
import re
from pathlib import Path

SKILL_NAMES = [
    "200lab-system-design",
    "200lab-backend-reliability",
    "200lab-systematic-debugging",
    "200lab-agent-harness",
    "200lab-diagram-director",
    "200lab-ai-tutor",
    "200lab-technical-review",
    "200lab-html-presentation",
]

def validate_skill(skill_dir: Path) -> dict:
    skill_md = skill_dir / "SKILL.md"
    results = {
        "name": skill_dir.name,
        "exists": skill_md.exists(),
        "frontmatter_valid": False,
        "line_count": 0,
        "line_count_valid": False,
        "has_scope": False,
        "has_security": False,
        "errors": []
    }

    if not skill_md.exists():
        results["errors"].append("SKILL.md does not exist")
        return results

    content = skill_md.read_text(encoding="utf-8")
    lines = content.splitlines()
    results["line_count"] = len(lines)
    results["line_count_valid"] = len(lines) < 300

    # Frontmatter check
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm = parts[1]
            if "name:" in fm and "description:" in fm:
                results["frontmatter_valid"] = True
            else:
                results["errors"].append("Frontmatter missing 'name' or 'description'")
        else:
            results["errors"].append("Frontmatter not properly closed with ---")
    else:
        results["errors"].append("Missing starting --- frontmatter delimiter")

    # Scope & Security check
    lower_content = content.lower()
    if "scope" in lower_content or "handles" in lower_content:
        results["has_scope"] = True
    else:
        results["errors"].append("Missing explicit Scope boundary")

    if "security" in lower_content or "secret" in lower_content:
        results["has_security"] = True
    else:
        results["errors"].append("Missing explicit Security policy")

    return results

def main():
    root = Path(__file__).resolve().parent.parent
    skills_dir = root / "skills"
    
    print("==========================================================")
    print("      200Lab Agent Skills: Metadata & Quality Validation  ")
    print("==========================================================\n")

    all_passed = True
    for name in SKILL_NAMES:
        sdir = skills_dir / name
        res = validate_skill(sdir)
        
        status = "PASS" if not res["errors"] and res["line_count_valid"] else "FAIL"
        if status == "FAIL":
            all_passed = False
            
        print(f"[{status}] {name}")
        print(f"       Lines: {res['line_count']} (<300: {res['line_count_valid']}) | Frontmatter: {res['frontmatter_valid']} | Scope: {res['has_scope']} | Security: {res['has_security']}")
        if res["errors"]:
            for err in res["errors"]:
                print(f"       ❌ {err}")
        print()

    # Check shared files
    shared_files = ["mcp-discovery.md", "connection-check.md", "security-policy.md", "report-schema.md"]
    print("Shared Documents Check:")
    for sf in shared_files:
        p = root / "shared" / sf
        if p.exists():
            print(f"  [PASS] shared/{sf} exists ({len(p.read_text(encoding='utf-8').splitlines())} lines)")
        else:
            print(f"  [FAIL] shared/{sf} missing!")
            all_passed = False

    print("\n==========================================================")
    if all_passed:
        print("[SUCCESS] All 8 200Lab Agent Skills passed validation!")
        sys.exit(0)
    else:
        print("[FAILED] Some validation checks failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
