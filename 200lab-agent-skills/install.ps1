<#
.SYNOPSIS
  Installer for 200Lab Agent Skills on Windows (Agy CLI & Codex CLI)
#>
param(
    [ValidateSet("all", "agy", "codex", "project")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Skills = @(
    "200lab-system-design",
    "200lab-backend-reliability",
    "200lab-systematic-debugging",
    "200lab-agent-harness",
    "200lab-diagram-director",
    "200lab-ai-tutor",
    "200lab-technical-review",
    "200lab-html-presentation"
)

function Install-ToDir($TargetDir, $Label) {
    Write-Host "[*] Installing to $Label ($TargetDir)..." -ForegroundColor Cyan
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }
    
    foreach ($s in $Skills) {
        $src = Join-Path $ScriptDir "skills\$s"
        $dest = Join-Path $TargetDir $s
        if (Test-Path $dest) {
            Remove-Item -Recurse -Force $dest
        }
        Copy-Item -Recurse -Path $src -Destination $dest
        Write-Host "  [+] $s -> $dest" -ForegroundColor Green
    }
    Write-Host "[OK] Completed installation for $Label.`n" -ForegroundColor Green
}

$HomeDir = [Environment]::GetFolderPath("UserProfile")
$AgyDir = Join-Path $HomeDir ".gemini\config\skills"
$CodexDir = Join-Path $HomeDir ".codex\skills"
$ProjectDir = Join-Path (Get-Location) ".agents\skills"

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "      200Lab Agent Skills - Multi-CLI Installer           " -ForegroundColor Yellow
Write-Host "==========================================================`n" -ForegroundColor Yellow

if ($Target -eq "all" -or $Target -eq "agy") {
    Install-ToDir $AgyDir "Antigravity CLI (Global)"
}
if ($Target -eq "all" -or $Target -eq "codex") {
    Install-ToDir $CodexDir "OpenAI Codex CLI"
}
if ($Target -eq "all" -or $Target -eq "project") {
    Install-ToDir $ProjectDir "Current Project (.agents/skills)"
}

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "Usage:" -ForegroundColor Cyan
Write-Host "  - Antigravity CLI : /200lab-system-design" -ForegroundColor White
Write-Host "  - OpenAI Codex CLI: `$200lab-system-design" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Yellow
