param(
  [switch]$NoBrowser,
  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 18 或更新版本是必需的。请先安装 Node.js。"
}

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
  throw "当前 Node.js 版本过低（$nodeMajor），需要 18 或更新版本。"
}

$port = if ($env:PORT) { $env:PORT } else { "4173" }
$url = "http://127.0.0.1:$port"
$portNumber = 0
if (-not [int]::TryParse($port, [ref]$portNumber)) {
  throw "PORT 必须是数字，当前值为：$port"
}

$existingConnections = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue)
if ($existingConnections.Count -gt 0) {
  $ownerIds = @($existingConnections | Select-Object -ExpandProperty OwningProcess -Unique)
  $healthy = $false
  try {
    $health = Invoke-WebRequest -UseBasicParsing "$url/healthz" -TimeoutSec 2
    $healthy = $health.StatusCode -eq 200
  } catch {
    $healthy = $false
  }

  if ($healthy -and -not $Restart) {
    Write-Host "检测到 JEV Landlords Lab 已在运行：$url"
    if (-not $NoBrowser) { Start-Process $url }
    exit 0
  }

  $serverProcesses = @(
    $ownerIds | ForEach-Object {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $_" -ErrorAction SilentlyContinue
      if ($process.CommandLine -match "server\.mjs") { $process }
    }
  )
  if ($serverProcesses.Count -gt 0) {
    $serverProcesses | ForEach-Object {
      Write-Host "停止旧的 JEV 服务进程：PID $($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 300
  } else {
    throw "端口 $portNumber 已被其他程序占用。请更换 PORT，或先释放该端口。"
  }
}

if (-not $NoBrowser) {
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-Command",
    "Start-Sleep -Milliseconds 700; Start-Process '$url'"
  ) | Out-Null
}

Write-Host "JEV Landlords Lab 正在启动：$url"
Write-Host "按 Ctrl+C 停止服务。"
& node server.mjs
