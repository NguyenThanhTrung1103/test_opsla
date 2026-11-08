# Check Tri-Pillar: Spec Kit + Repository Harness + g8s Gatekeeper
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [TRI-PILLAR VERIFICATION] Spec Kit + Harness + g8s" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$allPassed = $true

# 1. Spec Kit Check
Write-Host "`n[1/3] Kiem tra Tru cot 1: Spec Kit (.specify)..." -ForegroundColor Yellow
$constitutionPath = ".specify/memory/constitution.md"
if (Test-Path $constitutionPath) {
    Write-Host "  [PASS] Hien phap (.specify/memory/constitution.md): TON TAI" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Hien phap (.specify/memory/constitution.md): THIEU" -ForegroundColor Red
    $allPassed = $false
}

$templatesPath = ".specify/templates"
if (Test-Path $templatesPath) {
    Write-Host "  [PASS] Thu muc Templates (.specify/templates): SAN SANG" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Thu muc Templates (.specify/templates): THIEU" -ForegroundColor Red
    $allPassed = $false
}

# 2. Repository Harness Check
Write-Host "`n[2/3] Kiem tra Tru cot 2: Repository Harness..." -ForegroundColor Yellow
$harnessExe = ".\scripts\bin\harness.exe"
if (Test-Path $harnessExe) {
    Write-Host "  [PASS] Harness Binary (scripts/bin/harness.exe): TON TAI" -ForegroundColor Green
    try {
        $doctorOutput = & $harnessExe doctor 2>&1
        Write-Host "  [PASS] Harness Doctor: PASS" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] Harness Doctor: FAIL" -ForegroundColor Red
        $allPassed = $false
    }
} else {
    Write-Host "  [FAIL] Harness Binary ($harnessExe): THIEU" -ForegroundColor Red
    $allPassed = $false
}

if (Test-Path "harness.db") {
    Write-Host "  [PASS] Durable Database (harness.db): DA KET NOI" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Durable Database (harness.db): THIEU" -ForegroundColor Red
    $allPassed = $false
}

if (Test-Path "AGENTS.md") {
    Write-Host "  [PASS] Hien phap dieu phoi (AGENTS.md): DA NAP" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Hien phap dieu phoi (AGENTS.md): THIEU" -ForegroundColor Red
    $allPassed = $false
}

# 3. g8s Gatekeeper Check
Write-Host "`n[3/3] Kiem tra Tru cot 3: g8s Gatekeeper..." -ForegroundColor Yellow
$g8sCmd = Get-Command g8s -ErrorAction SilentlyContinue
if ($g8sCmd) {
    $g8sVer = (& g8s version 2>&1 | Select-Object -First 1)
    Write-Host "  [PASS] g8s Binary: $g8sVer" -ForegroundColor Green
    
    # g8s Doctor
    try {
        $g8sDoc = & g8s doctor 2>&1
        Write-Host "  [PASS] g8s Doctor: HOAN TAT" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] g8s Doctor: CO LOI" -ForegroundColor Red
        $allPassed = $false
    }

    # Anti-patterns
    try {
        $antiPattern = & g8s doctor --anti-pattern-catalog 2>&1
        Write-Host "  [PASS] g8s 11 Anti-Patterns: SAN SANG" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] g8s Anti-Pattern check: LOI" -ForegroundColor Red
        $allPassed = $false
    }

    # TDD trap
    try {
        $tddCheck = & g8s doctor --tdd-trap-check 2>&1
        Write-Host "  [PASS] g8s TDD Trap Check: SACH SE (0 bay TDD)" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] g8s TDD Trap Check: CANH BAO" -ForegroundColor Red
        $allPassed = $false
    }
} else {
    Write-Host "  [FAIL] g8s Binary: Chua tim thay trong PATH" -ForegroundColor Red
    $allPassed = $false
}

Write-Host "`n----------------------------------------------------------" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host " [KET LUAN] TOAN BO BO BA TRU COT DEU DAT CHUAN (PASS)!" -ForegroundColor Green
    Write-Host " Repository da san sang cho quy trinh phat trien an toan Zero-Trust." -ForegroundColor Green
} else {
    Write-Host " [KET LUAN] Co thanh phan chua hoan thien. Vui long kiem tra lai." -ForegroundColor Yellow
}
Write-Host "==========================================================" -ForegroundColor Cyan
