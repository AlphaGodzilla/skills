#!/usr/bin/env bash
# 本地启动应用：加载环境变量 + 彩色日志，再交给 bootRun。
#
# 用法：
#   scripts/dev-run.sh                              # 默认启动
#   scripts/dev-run.sh -- --server.port=9090        # `--` 之后是应用参数
#   scripts/dev-run.sh --no-daemon -- --spring.profiles.active=prod
#   APP_LOG_LEVEL=DEBUG scripts/dev-run.sh          # 打开调试日志
#   SQL_LOG_LEVEL=DEBUG scripts/dev-run.sh          # 关系库组合下打印 SQL
#
# 参数约定：`--` 之前透传给 Gradle（如 --no-daemon、--rerun-tasks），`--` 之后作为应用参数。
# ⚠️ 应用参数必须放在 `--` 之后：`bootRun` 不接受裸的 `--server.port=9090`，
#    Gradle 会把它当成自己的选项并报 "Unknown command-line option"。需要复杂参数时直接用
#    ./gradlew bootRun --args='...'。
#
# 环境变量来源见 scripts/lib/load-env.sh（项目根 .env，可选）。没有 .env 也能起：
# application-db.yml / application-cache.yml 里给了本机开发的默认值。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/load-env.sh
source "${ROOT_DIR}/scripts/lib/load-env.sh"
load_env "${ROOT_DIR}" || true

cd "${ROOT_DIR}"

export SPRING_OUTPUT_ANSI_ENABLED=ALWAYS
export LOGGING_PATTERN_LEVEL='%clr(%5p){highlight} [%clr(${spring.application.name}){magenta}]'

# 日志级别按需覆盖，避免写死某个项目的包名：根 logger 用 APP_LOG_LEVEL，
# 关系库组合想看 SQL 时用 SQL_LOG_LEVEL（MongoDB 组合下该 logger 不存在，设了也无副作用）。
export LOGGING_LEVEL_ROOT="${APP_LOG_LEVEL:-INFO}"
if [[ -n "${SQL_LOG_LEVEL:-}" ]]; then
  export LOGGING_LEVEL_ORG_HIBERNATE_SQL="${SQL_LOG_LEVEL}"
fi

# 按 `--` 切分 Gradle 参数与应用参数（bash 3.2 兼容：空数组用 ${arr[@]+...} 展开）
gradle_args=()
app_args=()
after_separator=0
for arg in "$@"; do
  if [[ "${after_separator}" -eq 1 ]]; then
    app_args+=("${arg}")
    continue
  fi
  if [[ "${arg}" == "--" ]]; then
    after_separator=1
    continue
  fi
  gradle_args+=("${arg}")
done

if [[ ${#app_args[@]} -eq 0 ]]; then
  exec ./gradlew --console=rich bootRun ${gradle_args[@]+"${gradle_args[@]}"}
fi

exec ./gradlew --console=rich bootRun ${gradle_args[@]+"${gradle_args[@]}"} "--args=${app_args[*]}"
