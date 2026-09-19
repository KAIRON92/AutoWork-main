$Host.UI.RawUI.WindowTitle = "AutoWork Instant Client Live Link"
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host "            AutoWork Instant Client Live Link Generator                " -ForegroundColor Yellow
Write-Host "=======================================================================" -ForegroundColor Cyan
Write-Host ""

$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    $sysCmd = Get-Command "cloudflared" -ErrorAction SilentlyContinue
    if ($sysCmd) {
        $cfExe = $sysCmd.Source
    }
}

if (-not (Test-Path $cfExe)) {
    Write-Host "[ERROR] cloudflared.exe system me nahi mila." -ForegroundColor Red
    Write-Host "Kripya ensure karein ki cloudflared installed hai." -ForegroundColor Yellow
    Read-Host "Press Enter to exit..."
    exit 1
}

Write-Host "[1/2] Checking if AutoWork local server is running..." -ForegroundColor Cyan
$tcp = New-Object System.Net.Sockets.TcpClient
$running = $false
try {
    $async = $tcp.BeginConnect("127.0.0.1", 3000, $null, $null)
    $wait = $async.AsyncWaitHandle.WaitOne(800, $false)
    if ($wait) {
        $tcp.EndConnect($async)
        $running = $true
    }
} catch {}
finally {
    $tcp.Close()
}

if ($running) {
    Write-Host "[OK] AutoWork is running locally on port 3000." -ForegroundColor Green
} else {
    Write-Host "[WARNING] AutoWork port 3000 abhi offline hai!" -ForegroundColor Yellow
    Write-Host "Aap link generate kar lijiye, lekin client ko '502 Bad Gateway' dikhega" -ForegroundColor Yellow
    Write-Host "jab tak aap ek dusri window me 'start.bat' chala kar AutoWork on nahi karenge!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2/2] Requesting secure instant public tunnel..." -ForegroundColor Cyan
Write-Host "Please wait a few seconds..." -ForegroundColor Gray
Write-Host ""

# Kill any stale cloudflared instances
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $cfExe
$psi.Arguments = "tunnel --url http://127.0.0.1:3000 --http-host-header=localhost:3000"
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$linkFound = $false
$publicUrl = ""

try {
    while (-not $proc.HasExited) {
        $line = $proc.StandardError.ReadLine()
        if ($null -eq $line) {
            Start-Sleep -Milliseconds 100
            continue
        }

        if (-not $linkFound -and $line -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)" -and $matches[1] -notmatch "api\.trycloudflare\.com") {
            $linkFound = $true
            $publicUrl = $matches[1]

            # Copy to clipboard
            try { Set-Clipboard -Value $publicUrl -ErrorAction SilentlyContinue } catch { try { $publicUrl | clip.exe } catch {} }

            Write-Host ""
            Write-Host "=======================================================================" -ForegroundColor Green
            Write-Host "   SUCCESS! YOUR INSTANT CLIENT PREVIEW LINK IS READY:                 " -ForegroundColor Yellow
            Write-Host "=======================================================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "   PUBLIC LINK : " -NoNewline -ForegroundColor Cyan
            Write-Host " $publicUrl " -ForegroundColor Black -BackgroundColor Cyan
            Write-Host ""
            Write-Host "   [COPIED] Link aapke Clipboard me copy ho gaya hai!" -ForegroundColor Green
            Write-Host "   Aap ise WhatsApp, Slack, ya Client ko bhej sakte hain." -ForegroundColor White
            Write-Host ""
            Write-Host "   Client kya-kya kar sakta hai:" -ForegroundColor Yellow
            Write-Host "    * ⚡ 1-Click Instant Demo Login (bina password/signup ke direct dashboard)" -ForegroundColor Cyan
            Write-Host "    * New Custom Workspace Registration" -ForegroundColor Gray
            Write-Host "    * Real pCloud OAuth / Code Connection" -ForegroundColor Gray
            Write-Host "    * Campaign execution, File management, Real-time Logs" -ForegroundColor Gray
            Write-Host ""
            Write-Host "   [IMPORTANT] Jab tak client test kar raha hai, is window ko OPEN rakhein." -ForegroundColor Magenta
            Write-Host "   Stop karne ke liye [Ctrl + C] dabayein." -ForegroundColor DarkYellow
            Write-Host "=======================================================================" -ForegroundColor Green
            Write-Host ""
        }
    }
} finally {
    if ($proc -and -not $proc.HasExited) {
        try { $proc.Kill() } catch {}
    }
}
