#!/usr/bin/env bash
# 日常快速跑测试：单元 / 组件 / 服务契约测试。
# **不判**覆盖率与 CRAP（那是 scripts/qa-gate.sh 的事），因此可以随时反复跑。
#
# 用法：
#   scripts/dev-test.sh                                  # 全部跑一次
#   scripts/dev-test.sh src/utils/format.test.ts         # 只跑一个文件
#   scripts/dev-test.sh -t "truncate"                    # 只跑名字匹配的用例
#   scripts/dev-test.sh --watch                          # 进入监听模式
#
# 测试分层与各自该测什么，见 docs/scaffold/development.md。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

VITEST="${ROOT_DIR}/node_modules/.bin/vitest"
if [[ ! -x "${VITEST}" ]]; then
    echo "✗ 找不到 vitest（node_modules/.bin/vitest）。先执行：npm install" >&2
    exit 2
fi

if [[ "${1:-}" == "--watch" ]]; then
    shift
    exec "${VITEST}" "$@"
fi

exec "${VITEST}" run "$@"
