#!/usr/bin/env bash
# 本地启动开发服务器。
#
# 用法：
#   scripts/dev-run.sh                                  # 带 mock：无需后端即可点通页面
#   scripts/dev-run.sh --no-mock                        # 关掉 mock，走真实后端
#   API_TARGET=http://localhost:9090 scripts/dev-run.sh --no-mock
#   scripts/dev-run.sh -- --port 8001                   # `--` 之后的参数透传给 umi
#
# 两种模式的差别：
#   · 带 mock（默认，等价 npm start）：`/api/**` 由 mock/ 目录里的假数据响应，可离线开发；
#   · --no-mock（等价 npm run dev）：`/api/**` 经 config/proxy.ts 转发到 API_TARGET（默认
#     http://localhost:8080，可用环境变量或项目根 .env 覆盖，见 .env.example）。
#
# 生产构建不含代理：前后端同源部署，前端用相对路径直接打后端。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

MOCK=1
if [[ "${1:-}" == "--no-mock" ]]; then
    MOCK=0
    shift
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "✗ 还没安装依赖。先执行：npm install" >&2
    exit 2
fi

if [[ ${MOCK} -eq 1 ]]; then
    echo "▸ 启动开发服务器（带 mock；关掉用 --no-mock）"
    exec npm start -- "$@"
fi

echo "▸ 启动开发服务器（真实后端；代理目标 ${API_TARGET:-见 config/proxy.ts 的默认值}）"
exec npm run dev -- "$@"
