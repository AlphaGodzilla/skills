#!/usr/bin/env bash
# 跑单元与契约测试：只加载可选的环境变量覆盖，然后执行 gradle test。
#
# 用法：
#   scripts/dev-test.sh                                   # 全部单元与契约测试
#   scripts/dev-test.sh --tests 'com.acme.app.shared.id.UlidTest'
#   scripts/dev-test.sh --no-daemon --rerun-tasks
#
# 这些测试**不需要**任何外部依赖：测试 profile 用 H2 与测试替身，所以这里不碰 podman、不碰容器。
# 需要真实数据库的集成测试（@Tag("integration")）默认被 test 任务排除，用 scripts/dev-it.sh 跑：
# 它会用 podman 起容器、跑 IT、并在结束时删除容器。
#
# 与 dev-run.sh 共用同一份 .env（可选）。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/load-env.sh
source "${ROOT_DIR}/scripts/lib/load-env.sh"
load_env "${ROOT_DIR}" || true

cd "${ROOT_DIR}"

exec ./gradlew --console=rich test "$@"
