#!/usr/bin/env python3
"""
200Lab Agent Skills Installer for Antigravity CLI (Agy) & OpenAI Codex CLI
"""

import os
import sys
import shutil
import argparse
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

def install_skills(source_dir: Path, target_dir: Path, target_name: str):
    print(f"[*] Installing 200Lab Agent Skills to {target_name} ({target_dir})...")
    target_dir.mkdir(parents=True, exist_ok=True)
    
    installed_count = 0
    for skill in SKILL_NAMES:
        skill_src = source_dir / "skills" / skill
        if not skill_src.exists():
            print(f"  [!] Warning: Source for {skill} not found at {skill_src}")
            continue
        
        dest = target_dir / skill
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(skill_src, dest)
        print(f"  [+] Installed {skill} -> {dest}")
        installed_count += 1
        
    print(f"[OK] Successfully installed {installed_count}/{len(SKILL_NAMES)} skills to {target_name}.\n")

def main():
    parser = argparse.ArgumentParser(description="Install 200Lab Agent Skills for Agy CLI & Codex CLI.")
    parser.add_argument(
        "--target",
        choices=["all", "agy", "codex", "project"],
        default="all",
        help="Target runtime environment (default: all)",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    home_dir = Path.home()

    # Paths
    agy_global = home_dir / ".gemini" / "config" / "skills"
    codex_skills = home_dir / ".codex" / "skills"
    project_skills = Path.cwd() / ".agents" / "skills"

    print("==========================================================")
    print("      200Lab Agent Skills - Multi-CLI Installer           ")
    print("==========================================================\n")

    if args.target in ["all", "agy"]:
        install_skills(script_dir, agy_global, "Antigravity CLI (Global)")

    if args.target in ["all", "codex"]:
        install_skills(script_dir, codex_skills, "OpenAI Codex CLI")

    if args.target in ["all", "project"]:
        install_skills(script_dir, project_skills, "Current Project (.agents/skills)")

    print("==========================================================")
    print("How to use:")
    print("  - Antigravity CLI : /200lab-system-design")
    print("  - OpenAI Codex CLI: $200lab-system-design")
    print("==========================================================")

if __name__ == "__main__":
    main()
