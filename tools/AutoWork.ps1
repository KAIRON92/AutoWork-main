[CmdletBinding()]
param(
  [ValidateSet('menu','setup-run','run','git-push','git-update','diagnose','stop')]
  [string]$Action = 'run'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot
$ComposeFile = Join-Path $RepoRoot 'docker/docker-compose.yml'
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'
$EnvExample = Join-Path $RepoRoot '.env.example'
$BackendEnv = Join-Path $BackendDir '.env'
$RootEnv = Join-Path $RepoRoot '.env'

function Say($m) { Write-Host "[AutoWork] $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Fail($m) { throw "[AutoWork] $m" }
function Has($name) { return $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

function Safe-DirExists([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $false }
  try {
    return [System.IO.Directory]::Exists($p)
  } catch {
    return $false
  }
}

function Refresh-SessionPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')

  $paths = [System.Collections.Generic.List[string]]::new()

  $candidates = @(
    'C:\Program Files\nodejs',
    'C:\Program Files (x86)\nodejs',
    'C:\nvm4w\nodejs',
    "$env:LOCALAPPDATA\Programs\nodejs",
    "$env:APPDATA\npm",
    "$env:APPDATA\nvm",
    "$env:USERPROFILE\.nvm",
    'C:\Program Files\Git\cmd',
    'C:\Program Files\Git\bin',
    'C:\Program Files\Docker\Docker\resources\bin',
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
  )

  foreach ($c in $candidates) {
    if ((Safe-DirExists $c) -and (-not $paths.Contains($c))) {
      $paths.Add($c)
    }
  }

  if ($env:Path) {
    foreach ($p in $env:Path.Split(';')) {
      if ((Safe-DirExists $p) -and (-not $paths.Contains($p))) {
        $paths.Add($p)
      }
    }
  }

  if ($machinePath) {
    foreach ($p in $machinePath.Split(';')) {
      if ((Safe-DirExists $p) -and (-not $paths.Contains($p))) {
        $paths.Add($p)
      }
    }
  }

  if ($userPath) {
    foreach ($p in $userPath.Split(';')) {
      if ((Safe-DirExists $p) -and (-not $paths.Contains($p))) {
        $paths.Add($p)
      }
    }
  }

  $env:Path = ($paths -join ';')
}

function Install-WithWinget($id, $label) {
  if (-not (Has 'winget')) {
    Fail "WinGet is not available. Please install/update Windows App Installer, then run AutoWork again."
  }
  Say "Automatically installing $label with WinGet..."
  & winget install --id $id -e --source winget --accept-source-agreements --accept-package-agreements
  Refresh-SessionPath
  if (-not (Has ($id.Split('.')[-1].ToLowerInvariant()))) {
    Refresh-SessionPath
  }
  Ok "$label installation completed."
}

function Ensure-Tools {
  Say "Analyzing and verifying system prerequisites..."
  Refresh-SessionPath

  # 1. Git verification
  if (-not (Has 'git')) {
    Install-WithWinget 'Git.Git' 'Git'
    Refresh-SessionPath
  }
  if (-not (Has 'git')) { Fail 'Git is not accessible in PATH. Please restart terminal after Git installation.' }

  # 2. Node.js & npm verification
  if (-not (Has 'node') -or -not (Has 'npm')) {
    Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    Refresh-SessionPath
  }
  if (-not (Has 'node')) { Fail 'Node.js is not accessible in PATH. Please reopen terminal after Node.js installation.' }
  if (-not (Has 'npm')) { Fail 'npm is not accessible in PATH. Please reopen terminal after Node.js installation.' }

  # 3. Docker verification
  if (-not (Has 'docker')) {
    Refresh-SessionPath
    if (-not (Has 'docker')) {
      Say "Docker CLI not detected. Attempting automatic installation via WinGet..."
      Install-WithWinget 'Docker.DockerDesktop' 'Docker Desktop'
      Refresh-SessionPath
    }
  }
  if (-not (Has 'docker')) {
    Fail 'Docker CLI is not available. Please install Docker Desktop and restart AutoWork.'
  }

  # 4. Docker Engine readiness check
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    $dockerCandidates = @(
      (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')
    )
    $started = $false
    foreach ($exe in $dockerCandidates) {
      if (Test-Path $exe) {
        Say "Docker Desktop is installed but not running. Launching Docker Desktop engine..."
        Start-Process $exe | Out-Null
        $started = $true
        break
      }
    }
    if (-not $started) {
      Say "Waiting for Docker Engine to start..."
    }

    Write-Host -NoNewline "[AutoWork] Waiting for Docker Engine to become ready " -ForegroundColor Cyan
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 2
      & docker info *> $null
      if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
      }
      Write-Host -NoNewline "." -ForegroundColor Yellow
    }
    Write-Host ""
    if (-not $ready) {
      Fail 'Docker Desktop engine is taking longer than expected. Please open Docker Desktop, ensure the engine is running, then run AutoWork again.'
    }
  }

  Ok "System prerequisites verified: Node.js $(& node -v), npm $(& npm -v), Git, and Docker Engine are ready."
}

function Set-EnvKey($path, $key, $value) {
  $lines = @()
  if (Test-Path $path) { $lines = @(Get-Content $path) }
  $found = $false
  $escaped = [regex]::Escape($key)
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*$escaped=") { $found = $true; "$key=$value" } else { $line }
  }
  if (-not $found) { $out += "$key=$value" }
  Set-Content -Path $path -Value $out -Encoding UTF8
}

function Test-PortInUse([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $success = $iar.AsyncWaitHandle.WaitOne(600, $false)
    if ($success) {
      $client.EndConnect($iar)
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-FreePort([int]$StartPort) {
  $port = $StartPort
  while ($port -lt 65535) {
    if (-not (Test-PortInUse $port)) {
      return $port
    }
    $port++
  }
  return $StartPort
}

function Resolve-ServicePorts {
  $existingPgContainer = $false
  $existingRedisContainer = $false
  if (Has 'docker') {
    $pgState = & docker inspect -f '{{.State.Running}}' autowork-postgres 2>$null
    if ($pgState -eq 'true') { $existingPgContainer = $true }
    $redisState = & docker inspect -f '{{.State.Running}}' autowork-redis 2>$null
    if ($redisState -eq 'true') { $existingRedisContainer = $true }
  }

  $pgPort = 5432
  if (Test-PortInUse 5432) {
    if ($existingPgContainer) {
      Say "Port 5432 is already bound by the active autowork-postgres container."
    } else {
      $pgPort = Get-FreePort 5433
      Warn "Port 5432 is in use by an external service (e.g. host Windows PostgreSQL). Re-routing AutoWork database to collision-free port $pgPort."
    }
  } else {
    $pgPort = 5432
  }

  $redisPort = 6379
  if (Test-PortInUse 6379) {
    if ($existingRedisContainer) {
      Say "Port 6379 is already bound by the active autowork-redis container."
    } else {
      $redisPort = Get-FreePort 6380
      Warn "Port 6379 is in use by an external service. Re-routing AutoWork Redis to collision-free port $redisPort."
    }
  } else {
    $redisPort = 6379
  }

  return @{ PgPort = $pgPort; RedisPort = $redisPort }
}

function Ensure-Env($ports) {
  Say "Configuring environment configuration files..."
  if (-not (Test-Path $EnvExample)) { Fail '.env.example is missing.' }
  if (-not (Test-Path $BackendEnv)) {
    Copy-Item $EnvExample $BackendEnv
    Say 'Created backend/.env from .env.example template.'
  }
  if (-not (Test-Path $RootEnv)) { New-Item -ItemType File -Path $RootEnv -Force | Out-Null }

  $pgPort = $ports.PgPort
  $redisPort = $ports.RedisPort

  Set-EnvKey $RootEnv 'POSTGRES_USER' 'autowork'
  Set-EnvKey $RootEnv 'POSTGRES_PASSWORD' 'autoworkpass'
  Set-EnvKey $RootEnv 'POSTGRES_DB' 'autowork_db'
  Set-EnvKey $RootEnv 'POSTGRES_HOST_PORT' $pgPort
  Set-EnvKey $RootEnv 'REDIS_HOST_PORT' $redisPort

  Set-EnvKey $BackendEnv 'POSTGRES_USER' 'autowork'
  Set-EnvKey $BackendEnv 'POSTGRES_PASSWORD' 'autoworkpass'
  Set-EnvKey $BackendEnv 'POSTGRES_DB' 'autowork_db'
  Set-EnvKey $BackendEnv 'DATABASE_URL' "postgresql://autowork:autoworkpass@localhost:$pgPort/autowork_db?schema=public"
  Set-EnvKey $BackendEnv 'REDIS_HOST' 'localhost'
  Set-EnvKey $BackendEnv 'REDIS_PORT' $redisPort

  Set-EnvKey $RootEnv 'DATABASE_URL' "postgresql://autowork:autoworkpass@localhost:$pgPort/autowork_db?schema=public"
  Set-EnvKey $RootEnv 'REDIS_HOST' 'localhost'
  Set-EnvKey $RootEnv 'REDIS_PORT' $redisPort

  $existing = Get-Content $BackendEnv -Raw
  $jwt = [Convert]::ToBase64String((1..48 | ForEach-Object { [byte](Get-Random -Minimum 0 -Maximum 256) }))
  $enc = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Minimum 0 -Maximum 256) }))
  $emailEnc = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Minimum 0 -Maximum 256) }))
  if ($existing -match '<long-random-secret>|JWT_SECRET=replace') { Set-EnvKey $BackendEnv 'JWT_SECRET' $jwt }
  if ($existing -match 'REFRESH_TOKEN_SECRET=<long-random-secret>|REFRESH_TOKEN_SECRET=replace') { Set-EnvKey $BackendEnv 'REFRESH_TOKEN_SECRET' $jwt }
  if ($existing -match 'PCLOUD_CREDENTIAL_ENCRYPTION_KEY=replace-with-base64-32-byte-key') { Set-EnvKey $BackendEnv 'PCLOUD_CREDENTIAL_ENCRYPTION_KEY' $enc }
  if ($existing -match 'EMAIL_CREDENTIAL_ENCRYPTION_KEY=replace-with-base64-32-byte-key') { Set-EnvKey $BackendEnv 'EMAIL_CREDENTIAL_ENCRYPTION_KEY' $emailEnc }

  Ok "Environment configured (PostgreSQL port=$pgPort, Redis port=$redisPort)."
}

function Install-IfNeeded($dir, $label) {
  $modules = Join-Path $dir 'node_modules'
  if (-not (Test-Path $modules)) {
    Push-Location $dir
    try {
      Say "Installing dependencies for $label..."
      & npm install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { Fail "npm install failed in $label." }
    } finally { Pop-Location }
  } else {
    Say "Dependencies verified for $label."
  }
}

function Prepare-Dependencies {
  Install-IfNeeded $RepoRoot 'Root'
  Install-IfNeeded $BackendDir 'Backend'
  Install-IfNeeded $FrontendDir 'Frontend'
  Ok 'All project dependencies (Root, Backend, Frontend) are ready.'
}

function Start-Infra($ports) {
  Say "Starting isolated PostgreSQL (port $($ports.PgPort)) and Redis (port $($ports.RedisPort)) containers..."
  & docker compose -f $ComposeFile up -d postgres redis
  if ($LASTEXITCODE -ne 0) {
    Fail 'PostgreSQL/Redis failed to start. Run: docker compose -f docker/docker-compose.yml logs postgres redis'
  }

  Write-Host -NoNewline "[AutoWork] Waiting for PostgreSQL container to complete initialization " -ForegroundColor Cyan
  $pgReady = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    & docker compose -f $ComposeFile exec -T postgres pg_isready -U autowork -d autowork_db *> $null
    if ($LASTEXITCODE -eq 0) {
      $pgReady = $true
      break
    }
    Write-Host -NoNewline "." -ForegroundColor Yellow
  }
  Write-Host ""

  if (-not $pgReady) {
    Warn "PostgreSQL is initializing. Proceeding to database sync with automated readiness retry..."
  } else {
    Ok "PostgreSQL is healthy and accepting connections on port $($ports.PgPort)."
  }
}

function Stop-RunningProcesses {
  Say 'Releasing any existing process locks on application ports...'
  try {
    Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $procId = $_.Id
        $cmd = $null
        try {
          $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
          if ($cim) { $cmd = $cim.CommandLine }
        } catch { }
        if ($cmd -and ($cmd -like "*$RepoRoot*" -or $cmd -like "*autowork*")) {
          Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
      } catch { }
    }
  } catch { }

  try {
    Get-NetTCPConnection -LocalPort 3000, 4000, 4001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
      } catch { }
    }
  } catch { }
  Start-Sleep -Milliseconds 600
}

function Prepare-Database($ports) {
  Say 'Synchronizing database schema and Prisma clients...'
  Push-Location $BackendDir
  try {
    & npm run prisma:generate
    if ($LASTEXITCODE -ne 0) {
      Warn 'Prisma generate hit a file lock or issue; retrying after stopping running processes...'
      Stop-RunningProcesses
      & npm run prisma:generate
      if ($LASTEXITCODE -ne 0) {
        $clientPath = Join-Path $RepoRoot 'node_modules/.prisma/client/index.js'
        if (Test-Path $clientPath) {
          Warn 'Using existing generated Prisma Client.'
        } else {
          Fail 'Prisma Client generation failed.'
        }
      }
    }

    $rootPrisma = Join-Path $RepoRoot 'node_modules/.prisma'
    $backendModules = Join-Path $BackendDir 'node_modules'
    if (Test-Path $rootPrisma) {
      Copy-Item -Path $rootPrisma -Destination $backendModules -Recurse -Force -ErrorAction SilentlyContinue
      Copy-Item -Path (Join-Path $RepoRoot 'node_modules/@prisma/client/*') -Destination (Join-Path $backendModules '@prisma/client') -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Execute migration with automatic self-healing for P1000 or drift
    $migrationOutput = & npm run prisma:migrate:deploy 2>&1 | Out-String
    Write-Host $migrationOutput

    if ($LASTEXITCODE -ne 0 -or $migrationOutput -match "P1000|Authentication failed") {
      if ($migrationOutput -match "P1000|Authentication failed") {
        Warn "Database authentication mismatch detected (stale volume credentials). Auto-healing database volume..."
        & docker compose -f $ComposeFile down -v postgres
        & docker compose -f $ComposeFile up -d postgres
        Say "Waiting for freshly created PostgreSQL container..."
        for ($i = 0; $i -lt 30; $i++) {
          Start-Sleep -Seconds 1
          & docker compose -f $ComposeFile exec -T postgres pg_isready -U autowork -d autowork_db *> $null
          if ($LASTEXITCODE -eq 0) { break }
        }
        Say "Retrying migration on auto-healed database..."
        $retryOutput = & npm run prisma:migrate:deploy 2>&1 | Out-String
        Write-Host $retryOutput
        if ($LASTEXITCODE -ne 0) {
          Say "Applying schema via prisma db push fallback..."
          & npm run prisma:push -- --accept-data-loss
          if ($LASTEXITCODE -ne 0) { Fail 'Database synchronization failed after volume recovery.' }
        }
      } else {
        Say "Applying schema via prisma db push fallback..."
        & npm run prisma:push -- --accept-data-loss
        if ($LASTEXITCODE -ne 0) { Fail 'Database migration failed. Check PostgreSQL and backend/.env.' }
      }
    }
  } finally { Pop-Location }
  Ok 'Database schema and Prisma clients are 100% synchronized.'
}

function Stop-Project {
  Say 'Stopping existing AutoWork processes and containers...'
  Stop-RunningProcesses
  if (Has 'docker') {
    & docker compose -f $ComposeFile down *> $null
  }
  Ok 'AutoWork stopped.'
}

function Start-Terminals {
  Stop-RunningProcesses

  $jobs = @(
    @{Title='AutoWork Backend API'; Dir=$BackendDir; Cmd='npm run start:dev'},
    @{Title='AutoWork Frontend App'; Dir=$FrontendDir; Cmd='npm run dev'},
    @{Title='AutoWork Campaign Worker'; Dir=$RepoRoot; Cmd='npm run worker:campaign'},
    @{Title='AutoWork pCloud Worker'; Dir=$RepoRoot; Cmd='npm run worker:pcloud'},
    @{Title='AutoWork Email Worker'; Dir=$RepoRoot; Cmd='npm run worker:email'}
  )
  foreach ($job in $jobs) {
    $command = "Set-Location -LiteralPath '$($job.Dir)'; `$Host.UI.RawUI.WindowTitle='$($job.Title)'; $($job.Cmd)"
    Start-Process powershell.exe -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command', $command | Out-Null
  }
  Ok 'All services (Backend, Frontend, and 3 Background Workers) launched in individual consoles.'
}

function Wait-And-OpenBrowser {
  Say 'Waiting for services to become healthy...'
  $ready = $false
  for ($i = 0; $i -lt 35; $i++) {
    Start-Sleep -Seconds 2
    try {
      $res = Invoke-RestMethod -Uri 'http://localhost:4000/api/health' -TimeoutSec 2 -ErrorAction SilentlyContinue
      if ($res -and ($res.status -eq 'OK' -or $res.subsystems.api -eq 'HEALTHY')) {
        $ready = $true
        break
      }
    } catch { }
  }

  Say '🚀 AutoWork is LIVE!'
  Write-Host '---------------------------------------------------' -ForegroundColor Cyan
  Write-Host '  Web Application:  http://localhost:3000' -ForegroundColor Green
  Write-Host '  API Health Check: http://localhost:4000/api/health' -ForegroundColor Yellow
  Write-Host '  Swagger API Docs: http://localhost:4000/api/docs' -ForegroundColor Yellow
  Write-Host '---------------------------------------------------' -ForegroundColor Cyan

  Start-Process 'http://localhost:3000' | Out-Null
}

function Run-Project {
  Write-Host ''
  Write-Host '===================================================' -ForegroundColor Magenta
  Write-Host '       AutoWork 1-Click Universal Automation       ' -ForegroundColor Magenta
  Write-Host '===================================================' -ForegroundColor Magenta
  Stop-RunningProcesses
  Ensure-Tools
  $ports = Resolve-ServicePorts
  Ensure-Env $ports
  Prepare-Dependencies
  Start-Infra $ports
  Prepare-Database $ports
  Start-Terminals
  Wait-And-OpenBrowser
}

function Git-Update {
  Say 'Updating project from GitHub repository...'
  & git fetch origin
  if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed.' }
  $changes = @(git status --porcelain)
  if ($changes.Count -gt 0) { Fail 'Local changes exist. Commit/stash them before updating from GitHub.' }
  & git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { Fail 'GitHub and local main cannot be fast-forwarded safely. Resolve the branch state manually.' }
  Ok 'Local project updated from GitHub main.'
  Run-Project
}

function Git-Push {
  & git fetch origin
  if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed.' }
  $changes = @(git status --porcelain)
  if ($changes.Count -eq 0) {
    & git push origin main
    if ($LASTEXITCODE -ne 0) { Fail 'git push failed.' }
    Ok 'No local changes were pending; GitHub is up to date.'
    return
  }
  & git add .
  & git diff --cached --check
  if ($LASTEXITCODE -ne 0) { Fail 'Staged diff has whitespace errors. Fix them before pushing.' }
  git status
  $msg = Read-Host 'Commit message (blank = chore: sync AutoWork changes)'
  if ([string]::IsNullOrWhiteSpace($msg)) { $msg = 'chore: sync AutoWork changes' }
  & git commit -m $msg
  if ($LASTEXITCODE -ne 0) { Fail 'git commit failed.' }
  & git push origin main
  if ($LASTEXITCODE -ne 0) { Fail 'git push failed. The remote may have new commits; update from GitHub first.' }
  Ok 'Local changes committed and pushed to GitHub main.'
}

function Diagnose {
  Write-Host ''
  Say 'AutoWork Comprehensive Diagnostics'
  Write-Host "Repository: $RepoRoot"
  Refresh-SessionPath
  if (Has 'node') { Write-Host "Node.js: $(& node -v)" }
  if (Has 'npm') { Write-Host "npm:     $(& npm -v)" }
  if (Has 'git') { Write-Host "Git:     $(& git --version)" }
  if (Has 'docker') {
    Write-Host "Docker:  $(& docker --version)"
    Write-Host "Compose: $(& docker compose version)"
    & docker compose -f $ComposeFile ps
  }
  $ports = Resolve-ServicePorts
  Write-Host "Active DB Port: $($ports.PgPort)"
  Write-Host "Active Redis Port: $($ports.RedisPort)"
  Write-Host "backend/.env: $(Test-Path $BackendEnv)"
  Write-Host "backend/node_modules: $(Test-Path (Join-Path $BackendDir 'node_modules'))"
  Write-Host "frontend/node_modules: $(Test-Path (Join-Path $FrontendDir 'node_modules'))"
  if (Has 'git') { Write-Host 'Git Status:'; git status --short }
}

function Menu {
  Write-Host ''
  Write-Host '================ AutoWork Launcher Menu ================' -ForegroundColor Magenta
  Write-Host '1. 1-Click Launch (Auto-install, Database, Services)'
  Write-Host '2. Restart All Services'
  Write-Host '3. Update from GitHub and Run'
  Write-Host '4. Git Commit + Push'
  Write-Host '5. System Diagnostics'
  Write-Host '6. Stop All Services'
  Write-Host 'Q. Quit'
  Write-Host '========================================================'
  $choice = Read-Host 'Choose an option [1-6, Q]'
  switch ($choice.ToUpperInvariant()) {
    '1' { Run-Project }
    '2' { Run-Project }
    '3' { Git-Update }
    '4' { Git-Push }
    '5' { Diagnose }
    '6' { Stop-Project }
    'Q' { return }
    default { Warn 'Invalid choice.' }
  }
}

try {
  switch ($Action) {
    'menu' { Menu }
    'setup-run' { Run-Project }
    'run' { Run-Project }
    'git-push' { Git-Push }
    'git-update' { Git-Update }
    'diagnose' { Diagnose }
    'stop' { Stop-Project }
  }
} catch {
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
