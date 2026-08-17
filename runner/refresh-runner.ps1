# CRM Doscom - runner cap nhat du lieu.
#
# Vong lap: cu 60 giay hoi CRM "co ai bam nut Cap nhat du lieu khong?".
# Co thi chay 13 buoc pipeline that o may nay roi deploy, bao tien do nguoc ve CRM.
#
# Vi sao khong chay thang tren Cloudflare: Pages Functions khong co runtime Python, va
# pipeline do that mat ~16 phut (rieng fetch_pancake_crm_contacts ~8 phut).
# Chi tiet: openspec/changes/refresh-button/design.md
#
# Cach chay (PowerShell, dung dau .\ vi PowerShell khong tu chay file trong thu muc hien tai):
#   cd C:\Users\HXDUy\jarvis-1\crm-doscom
#   .\runner\refresh-runner.ps1              # chay lien tuc
#   .\runner\refresh-runner.ps1 -Once        # chay 1 luot roi thoat (de test)
#   .\runner\refresh-runner.ps1 -RunNow      # chay pipeline ngay, khong cho ai bam nut
#
# Xem them runner/README.md.

[CmdletBinding()]
param(
  [switch]$Once,
  [switch]$RunNow,
  [int]$PollSeconds = 60,
  [string]$BaseUrl = "https://crm-doscom.pages.dev"
)

$ErrorActionPreference = "Continue"
$RUNNER_VERSION = "1.0"

# -- Duong dan ----------------------------------------------------------------
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile  = Join-Path $RepoRoot ".dev.vars.refresh"
$LogDir   = Join-Path $PSScriptRoot "logs"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$script:LogFile = Join-Path $LogDir ("{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
$script:Utf8    = New-Object System.Text.UTF8Encoding $false

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "HH:mm:ss"), $Level, $Message
  Write-Host $line
  # Ghi bang .NET UTF-8: Add-Content mac dinh dung ANSI, lam mojibake tieng Viet trong log.
  [System.IO.File]::AppendAllText($script:LogFile, $line + [Environment]::NewLine, $script:Utf8)
}

# Tim bash chay duoc scripts/build-dist.sh.
# BAY (dinh that 17/08/2026): trong PATH cua PowerShell, "bash" thuong tro toi
# C:\Program Files\Git\usr\bin\bash.exe - ban MSYS, chay script lai bao
# "The system cannot find the file specified" va job that bai o buoc deploy.
# Ban dung la C:\Program Files\Git\bin\bash.exe. Uu tien no truoc, PATH chi la duong lui.
function Resolve-Bash {
  $candidates = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  $cmd = Get-Command bash -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

# Don log cu, giu 14 ngay gan nhat.
function Clear-OldLogs {
  Get-ChildItem $LogDir -Filter "*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    ForEach-Object { try { Remove-Item $_.FullName -Force -Confirm:$false } catch {} }
}

# -- Nap key ------------------------------------------------------------------
function Import-RefreshEnv {
  if (-not (Test-Path $EnvFile)) {
    Write-Log "Khong thay $EnvFile - chua co key thi khong chay duoc pipeline." "FATAL"
    exit 1
  }
  $vars = @{}
  foreach ($line in [System.IO.File]::ReadAllLines($EnvFile, $script:Utf8)) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^([A-Z0-9_]+)=(.*)$') {
      $k = $matches[1]; $v = $matches[2].Trim()
      if ($v) { $vars[$k] = $v; Set-Item -Path "env:$k" -Value $v }
    }
  }
  $missing = @('FB_ACCESS_TOKEN','WINDSOR_API_KEY','PANCAKE_API_KEY','PANCAKE_SHOP_ID',
               'PANCAKE_CRM_API_KEY','REFRESH_RUNNER_TOKEN') | Where-Object { -not $vars.ContainsKey($_) }
  if ($missing.Count -gt 0) {
    Write-Log ("Thieu key trong .dev.vars.refresh: " + ($missing -join ", ")) "FATAL"
    exit 1
  }
  return $vars
}

# -- Goi API CRM --------------------------------------------------------------
function Invoke-Crm {
  param([string]$Path, [string]$Method = "GET", $Body = $null, [switch]$WithToken)

  $headers = @{}
  if ($WithToken) { $headers["X-Refresh-Token"] = $env:REFRESH_RUNNER_TOKEN }

  # Cloudflare Access dang bat truoc crm-doscom.pages.dev: goi tran se an 302 ve trang
  # dang nhap va nhan HTML thay vi JSON. Co service token thi gui kem de di qua Access.
  # Khong co thi runner van chay duoc neu Access da co policy bypass cho 2 duong
  # /api/refresh/next va /api/refresh/report. Xem runner/README.md.
  if ($env:CF_ACCESS_CLIENT_ID -and $env:CF_ACCESS_CLIENT_SECRET) {
    $headers["CF-Access-Client-Id"]     = $env:CF_ACCESS_CLIENT_ID
    $headers["CF-Access-Client-Secret"] = $env:CF_ACCESS_CLIENT_SECRET
  }

  $params = @{
    Uri         = "$BaseUrl$Path"
    Method      = $Method
    Headers     = $headers
    TimeoutSec  = 60
    ErrorAction = "Stop"
  }
  if ($null -ne $Body) {
    $params["Body"]        = ($Body | ConvertTo-Json -Depth 6 -Compress)
    $params["ContentType"] = "application/json; charset=utf-8"
  }
  return Invoke-RestMethod @params
}

# Ghi noi dung loi vao log truoc khi bao ve CRM.
# THIEU SOT da dinh o job #4: buoc 'Google Ads - chi phi' hong, log chi ghi mot dong
# "loi (exit 1)" ma khong co ly do, phai vao D1 moi biet Windsor tra HTTP 500.
# Log o may la cho dau tien nguoi ta mo ra xem, no phai du de tra.
function Write-FailDetail {
  param([string]$Step, [string]$Output)
  Write-Log "----- chi tiet loi buoc '$Step' -----" "FAIL"
  $tail = ($Output -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 25) -join [Environment]::NewLine
  Write-Log $tail "FAIL"
  Write-Log "----- het chi tiet loi -----" "FAIL"
}

function Send-Report {
  param([int]$JobId, [int]$StepIndex, [string]$Step, [string]$Status,
        [string]$Message = "", [int]$Warnings = 0)
  try {
    Invoke-Crm -Path "/api/refresh/report" -Method POST -WithToken -Body @{
      job_id     = $JobId
      step_index = $StepIndex
      step       = $Step
      status     = $Status
      message    = $Message
      warnings   = $Warnings
    } | Out-Null
  } catch {
    # Bao cao that bai KHONG duoc lam hong pipeline dang chay - chi ghi log.
    Write-Log ("Khong gui duoc bao cao buoc '$Step': " + $_.Exception.Message) "WARN"
  }
}

# -- Chay 1 script Python -----------------------------------------------------
function Invoke-PipelineScript {
  param([string]$ScriptPath)

  Push-Location $RepoRoot
  try {
    $out = & python $ScriptPath 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $out }
  } finally {
    Pop-Location
  }
}

# -- Buoc kiem landing Noma ---------------------------------------------------
# Landing KHONG co buoc "lay du lieu": landing day don thang vao D1 cua CRM qua
# POST /api/nomaXXX/order, dashboard doc live qua /api/nomaXXX/stats - du lieu luon tuoi.
# Buoc nay kiem duong day don CON SONG. Da tung hong am tham: deploy lai landing lam lech
# NOMA911_INGEST_TOKEN -> don ngung ve CRM ma stats van tra 200 kem so cu.
function Test-NomaLandings {
  param([string[]]$Landings)

  $warnings = @()
  $lines    = @()

  foreach ($lp in $Landings) {
    try {
      $r = Invoke-Crm -Path "/api/$lp/stats?days=7"
      $byDate = @($r.by_date)
      if ($byDate.Count -eq 0) {
        $warnings += "$lp : khong co don nao trong 7 ngay"
        $lines    += "  $lp : 0 don / 7 ngay  <-- NGHI TOKEN LECH"
        continue
      }
      $last    = ($byDate | Sort-Object created_date | Select-Object -Last 1)
      $lastDay = [datetime]::ParseExact($last.created_date, "yyyy-MM-dd", $null)
      $ageH    = [int]((Get-Date).Date - $lastDay).TotalHours
      $total   = ($byDate | Measure-Object -Property orders -Sum).Sum
      if ($ageH -gt 48) {
        $warnings += "$lp : don gan nhat cach day $ageH gio - kiem NOMA911_INGEST_TOKEN cua landing"
        $lines    += "  $lp : don cuoi $($last.created_date) ($ageH gio truoc)  <-- IM LANG"
      } else {
        $lines += "  $lp : $total don / 7 ngay, don cuoi $($last.created_date)"
      }
    } catch {
      $warnings += "$lp : goi stats loi - $($_.Exception.Message)"
      $lines    += "  $lp : LOI goi stats"
    }
  }

  return [pscustomobject]@{
    Warnings = $warnings
    Text     = (($lines) -join [Environment]::NewLine)
  }
}

# -- Chay tron mot job --------------------------------------------------------
function Invoke-RefreshJob {
  param([int]$JobId, $Steps, [string[]]$Landings)

  $totalWarnings = 0
  $warningNotes  = @()
  $idx = 0

  foreach ($step in $Steps) {
    $idx++
    $label = $step.label
    Write-Log "[$idx/$($Steps.Count)] $label"

    $stepWarn = 0
    $stepMsg  = ""

    switch ($step.key) {

      "noma_landings" {
        $res = Test-NomaLandings -Landings $Landings
        Write-Log $res.Text
        $stepWarn = $res.Warnings.Count
        if ($stepWarn -gt 0) {
          $stepMsg = ($res.Warnings -join "; ")
          $warningNotes += $res.Warnings
        }
      }

      "tests" {
        # Cong chat luong - GIONG refresh-data.yml. Do la chan cung, tuyet doi khong deploy.
        Push-Location $RepoRoot
        $out = & node --test tests/*.mjs 2>&1 | Out-String
        $code = $LASTEXITCODE
        Pop-Location
        if ($code -ne 0) {
          Write-Log "Test DO - dung pipeline, KHONG deploy." "FAIL"
          Write-FailDetail -Step $label -Output $out
          Send-Report -JobId $JobId -StepIndex $idx -Step $label -Status "failed" `
                      -Message $out -Warnings $totalWarnings
          return $false
        }
        $passLine = ($out -split "`n" | Where-Object { $_ -match 'pass \d+' } | Select-Object -First 1)
        Write-Log ("Test xanh. " + $passLine.Trim())
      }

      "deploy" {
        Push-Location $RepoRoot
        $bashExe = Resolve-Bash
        if (-not $bashExe) {
          Pop-Location
          Write-Log "Khong tim thay bash.exe - cai Git for Windows roi chay lai." "FAIL"
          Send-Report -JobId $JobId -StepIndex $idx -Step $label -Status "failed" `
                      -Message "Khong tim thay bash.exe de chay scripts/build-dist.sh" -Warnings $totalWarnings
          return $false
        }
        $bd = & $bashExe scripts/build-dist.sh 2>&1 | Out-String
        $bdCode = $LASTEXITCODE
        if ($bdCode -ne 0) {
          Pop-Location
          Write-Log "build-dist.sh loi - khong deploy." "FAIL"
          Write-FailDetail -Step $label -Output $bd
          Send-Report -JobId $JobId -StepIndex $idx -Step $label -Status "failed" `
                      -Message $bd -Warnings $totalWarnings
          return $false
        }
        Write-Log $bd.Trim()
        $env:CLOUDFLARE_ACCOUNT_ID = "cffb0c35f8c649872436b2087a64b7bc"
        $dp = & wrangler pages deploy dist --project-name=crm-doscom --branch=master --commit-dirty=true 2>&1 | Out-String
        $dpCode = $LASTEXITCODE
        Pop-Location
        if ($dpCode -ne 0) {
          Write-Log "Deploy loi." "FAIL"
          Write-FailDetail -Step $label -Output $dp
          Send-Report -JobId $JobId -StepIndex $idx -Step $label -Status "failed" `
                      -Message $dp -Warnings $totalWarnings
          return $false
        }
        Write-Log (($dp -split "`n" | Where-Object { $_ -match 'Deployment complete|Success' }) -join " ")
      }

      default {
        # 10 buoc dau: chay script Python.
        $r = Invoke-PipelineScript -ScriptPath $step.script
        if ($r.ExitCode -ne 0) {
          Write-Log "Buoc '$label' loi (exit $($r.ExitCode)) - dung pipeline." "FAIL"
          Write-FailDetail -Step $label -Output $r.Output
          Send-Report -JobId $JobId -StepIndex $idx -Step $label -Status "failed" `
                      -Message $r.Output -Warnings $totalWarnings
          return $false
        }
        # Dem canh bao SKIP. Vi du kinh nien: FB tra 400 cho ad-level tai khoan
        # 764394829882083 (Doscom - Noma.vn, qua nhieu ad cho mot luot goi 90 ngay).
        # Script van exit 0 va bo qua tai khoan do - dung, nhung phai bao cho nguoi dung biet.
        $skips = @([regex]::Matches($r.Output, "SKIP"))
        if ($skips.Count -gt 0) {
          $stepWarn = $skips.Count
          $detail = (($r.Output -split "`n" | Where-Object { $_ -match 'SKIP' }) -join "; ")
          $stepMsg = "$label : $detail"
          $warningNotes += $stepMsg
          Write-Log "Buoc nay co $stepWarn canh bao SKIP." "WARN"
        }
        # Log 12 dong cuoi de soat nhanh; log day du van o day het.
        Write-Log ((($r.Output -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 12) -join [Environment]::NewLine))
      }
    }

    $totalWarnings += $stepWarn

    if ($idx -lt $Steps.Count) {
      Send-Report -JobId $JobId -StepIndex $idx -Step $label -Status "ok" `
                  -Message $stepMsg -Warnings $stepWarn
    }
  }

  # Gui TONG canh bao, khong phai 0: endpoint /report o nhanh "done" GHI DE cot warnings
  # (khong cong don), nen gui 0 se xoa sach canh bao da tich luy o cac buoc truoc.
  # Da dinh that khi kiem thu 17/08/2026.
  Send-Report -JobId $JobId -StepIndex $Steps.Count -Step "Hoan tat" -Status "done" `
              -Message ($warningNotes -join [Environment]::NewLine) -Warnings $totalWarnings
  Write-Log "XONG. Tong canh bao: $totalWarnings"
  return $true
}

# -- Vong lap chinh -----------------------------------------------------------
Import-RefreshEnv | Out-Null
Clear-OldLogs
Write-Log "Runner v$RUNNER_VERSION khoi dong - CRM $BaseUrl, hoi moi $PollSeconds giay."

if ($RunNow) {
  # Tu tao job roi chay ngay, khong cho ai bam nut. Dung khi muon cap nhat gap tu may.
  try {
    $req = Invoke-Crm -Path "/api/refresh/request" -Method POST -Body @{}
    Write-Log "Da tao job #$($req.data.job_id) tu runner."
  } catch {
    Write-Log ("Khong tao duoc job: " + $_.Exception.Message) "FATAL"
    exit 1
  }
}

while ($true) {
  try {
    $res = Invoke-Crm -Path "/api/refresh/next?v=$RUNNER_VERSION" -WithToken

    # Access chan thi Invoke-RestMethod tra ve HTML trang dang nhap chu khong nem loi.
    # Bao thang, dung de runner "chay" im lang ma khong bao gio nhan duoc viec.
    if ($res -isnot [System.Management.Automation.PSCustomObject] -or $null -eq $res.ok) {
      Write-Log "CRM tra ve khong phai JSON - nhieu kha nang Cloudflare Access chan. Xem muc Access trong runner/README.md." "FATAL"
      if ($Once -or $RunNow) { break }
      Start-Sleep -Seconds $PollSeconds
      continue
    }

    if ($res.data) {
      $jobId = [int]$res.data.job_id
      Write-Log "Nhan job #$jobId (nguoi bam: $($res.data.requested_by))"
      $script:LogFile = Join-Path $LogDir ("{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
      $ok = Invoke-RefreshJob -JobId $jobId -Steps $res.data.steps -Landings $res.data.noma_landings
      Write-Log ("Job #$jobId ket thuc: " + $(if ($ok) { "THANH CONG" } else { "THAT BAI" }))
    }
  } catch {
    Write-Log ("Loi khi hoi viec: " + $_.Exception.Message) "WARN"
  }

  if ($Once -or $RunNow) { break }
  Start-Sleep -Seconds $PollSeconds
}
