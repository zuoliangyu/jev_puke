param(
  [switch]$NoBrowser
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
