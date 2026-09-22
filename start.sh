#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 或更新版本是必需的。请先安装 Node.js。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 18 )); then
  echo "当前 Node.js 版本过低（${NODE_MAJOR}），需要 18 或更新版本。" >&2
  exit 1
fi

PORT_VALUE="${PORT:-4173}"
URL="http://127.0.0.1:${PORT_VALUE}"

if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "${URL}/healthz" >/dev/null 2>&1; then
  echo "JEV Landlords Lab 已在运行：${URL}"
  if [[ "${NO_BROWSER:-0}" != "1" ]]; then
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
      open "$URL" >/dev/null 2>&1 || true
    elif command -v wslview >/dev/null 2>&1; then
      wslview "$URL" >/dev/null 2>&1 || true
    fi
  fi
  exit 0
fi

if command -v lsof >/dev/null 2>&1 && lsof -t -iTCP:"${PORT_VALUE}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 ${PORT_VALUE} 已被其他程序占用。请更换 PORT，或先释放该端口。" >&2
  exit 1
fi

if [[ "${NO_BROWSER:-0}" != "1" ]]; then
  (
    sleep 0.7
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
      open "$URL" >/dev/null 2>&1 || true
    elif command -v wslview >/dev/null 2>&1; then
      wslview "$URL" >/dev/null 2>&1 || true
    fi
  ) &
fi

echo "JEV Landlords Lab 正在启动：${URL}"
echo "按 Ctrl+C 停止服务。"
exec node server.mjs
