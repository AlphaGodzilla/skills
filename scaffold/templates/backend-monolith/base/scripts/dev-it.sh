#!/usr/bin/env bash
# 跑集成测试：用 podman 单命令起真实依赖容器（数据库；缓存为 redis 时再加 redis），
# 导出连接信息给测试 JVM，跑完**无论成功、失败还是 Ctrl-C 都删除容器**。
#
# 这是本仓库唯一使用 podman 的地方：单元与契约测试不需要任何外部依赖，也不碰容器。
# 本脚手架不负责部署阶段，因此这里没有任何镜像构建 / 编排逻辑。
#
# 用法：
#   scripts/dev-it.sh                          # 跑全部集成测试
#   scripts/dev-it.sh --tests 'com.acme.app.sample.SampleIntegrationIT'
#   scripts/dev-it.sh --keep                   # 跑完保留容器（调试用，记得手动 scripts/dev-it.sh clean）
#   scripts/dev-it.sh clean                    # 只清理遗留容器（上次异常退出时用）
#
# 端口与口令来自 .env（可选，模板见 .env.example），默认与 application-db.yml 一致。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/load-env.sh
source "${ROOT_DIR}/scripts/lib/load-env.sh"
load_env "${ROOT_DIR}" || true

DB_CONTAINER="{{project_name}}-it-db"
DB_PORT="${DB_HOST_PORT:-{{db_port}}}"
DB_NAME="{{db_name}}"
#?if db == "postgres" or db == "mysql"
DB_USER="${DB_USER:-{{db_user}}}"
DB_PASSWORD="${DB_PASSWORD:-{{db_password}}}"
#?endif
#?if db == "mysql"
# MYSQL_USER 不能用 root（官方 mysql 镜像会直接报错退出）；root 口令只在容器内部使用。
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root}"
#?endif
#?if cache == "redis"
REDIS_CONTAINER="{{project_name}}-it-redis"
REDIS_PORT="${REDIS_HOST_PORT:-6379}"
#?endif

# --keep 时用于提示的容器清单（redis 时含缓存容器）
CONTAINERS="${DB_CONTAINER}"
#?if cache == "redis"
CONTAINERS="${CONTAINERS} ${REDIS_CONTAINER}"
#?endif

# 上次异常退出（kill -9 等）可能留下同名容器：这里清一次，保证端口与名字可用
cleanup() {
  podman rm -f "${DB_CONTAINER}" >/dev/null 2>&1 || true
  #?if cache == "redis"
  podman rm -f "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
  #?endif
}

# 只清理遗留容器、不跑测试。⚠️ 必须在解析参数之前判断：参数解析会把 clean 收进 GRADLE_ARGS，
# 判断写在后面会让 `dev-it.sh clean` 真的去跑一遍集成测试。
if [[ "${1:-}" == "clean" ]]; then
  cleanup
  echo "已清理集成测试容器：${CONTAINERS}"
  exit 0
fi

KEEP=0
GRADLE_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1 ;;
    *) GRADLE_ARGS+=("$1") ;;
  esac
  shift
done

cleanup

# 无论后续哪一步失败、还是被 Ctrl-C 打断，都删除容器；--keep 时跳过（调试用）
# shellcheck disable=SC2317  # 由 trap 调用
on_exit() {
  local status=$?
  if [[ "${KEEP}" -eq 1 ]]; then
    echo "已保留容器（--keep）：${CONTAINERS}"
    echo "清理命令：scripts/dev-it.sh clean"
    return "${status}"
  fi
  cleanup
  if [[ "${status}" -ne 0 ]]; then
    echo "集成测试未通过（退出码 ${status}），容器已清理" >&2
  else
    echo "集成测试结束，容器已清理"
  fi
}
trap on_exit EXIT

echo "启动集成测试依赖（podman；测试结束后自动删除容器）"

#?if db == "mongodb"
podman run -d --rm --name "${DB_CONTAINER}" -p "${DB_PORT}:27017" mongo:8.0 >/dev/null
#?endif
#?if db == "postgres"
podman run -d --rm --name "${DB_CONTAINER}" -p "${DB_PORT}:5432" \
  -e "POSTGRES_DB=${DB_NAME}" -e "POSTGRES_USER=${DB_USER}" -e "POSTGRES_PASSWORD=${DB_PASSWORD}" \
  postgres:16-alpine >/dev/null
#?endif
#?if db == "mysql"
podman run -d --rm --name "${DB_CONTAINER}" -p "${DB_PORT}:3306" \
  -e "MYSQL_DATABASE=${DB_NAME}" -e "MYSQL_USER=${DB_USER}" -e "MYSQL_PASSWORD=${DB_PASSWORD}" \
  -e "MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}" \
  mysql:8.4 >/dev/null
#?endif
#?if cache == "redis"
podman run -d --rm --name "${REDIS_CONTAINER}" -p "${REDIS_PORT}:6379" redis:7-alpine >/dev/null
#?endif

ready() {
  #?if db == "postgres"
  podman exec "${DB_CONTAINER}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" -q
  #?endif
  #?if db == "mysql"
  podman exec "${DB_CONTAINER}" mysqladmin ping -h 127.0.0.1 -u root -p"${DB_ROOT_PASSWORD}" --silent
  #?endif
  #?if db == "mongodb"
  podman exec "${DB_CONTAINER}" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' | grep -q 1
  #?endif
  #?if cache == "redis"
  [[ "$(podman exec "${REDIS_CONTAINER}" redis-cli ping 2>/dev/null)" == "PONG" ]]
  #?endif
}

# mysql 首次初始化最慢，统一给 2s × 60 = 120s
for _ in $(seq 1 60); do
  if ready >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if ! podman container exists "${DB_CONTAINER}" 2>/dev/null; then
    echo "错误：容器已退出，查看日志：podman logs ${DB_CONTAINER}" >&2
    exit 1
  fi
done

if ! ready >/dev/null 2>&1; then
  echo "错误：依赖在 120 秒内未就绪。日志：" >&2
  podman logs --tail 30 "${DB_CONTAINER}" >&2 || true
  exit 1
fi
echo "依赖就绪：${DB_NAME} @ localhost:${DB_PORT}"

# 连接信息用 IT_* 前缀交给集成测试，由 SampleIntegrationIT 的 @DynamicPropertySource 接管。
# 刻意不用 SPRING_*：环境变量优先级高于 profile 文件，用 SPRING_* 会盖掉单元/契约测试的 H2 配置，
# 把「离线可跑」的测试变成依赖容器（实测会让 7 个非集成测试因数据源错配而失败）。
#?if db == "mongodb"
export IT_MONGODB_URI="mongodb://localhost:${DB_PORT}/${DB_NAME}"
#?endif
#?if db == "postgres"
export IT_DB_URL="jdbc:postgresql://localhost:${DB_PORT}/${DB_NAME}"
export IT_DB_USERNAME="${DB_USER}"
export IT_DB_PASSWORD="${DB_PASSWORD}"
#?endif
#?if db == "mysql"
export IT_DB_URL="jdbc:mysql://localhost:${DB_PORT}/${DB_NAME}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&characterEncoding=utf8"
export IT_DB_USERNAME="${DB_USER}"
export IT_DB_PASSWORD="${DB_PASSWORD}"
#?endif
#?if cache == "redis"
export IT_REDIS_HOST="localhost"
export IT_REDIS_PORT="${REDIS_PORT}"
#?endif

cd "${ROOT_DIR}"
# -PincludeIntegration 让 test 任务保留 @Tag("integration") 的测试（默认排除）
exec_status=0
./gradlew --console=rich test -PincludeIntegration ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"} || exec_status=$?
exit "${exec_status}"
