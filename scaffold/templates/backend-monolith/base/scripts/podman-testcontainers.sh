#!/usr/bin/env bash
set -euo pipefail

# Podman machine 下的 Testcontainers 连接参数脚本。
#
# ⚠️ 本底座默认没有 Testcontainers 测试（测试用 H2 + 测试替身，不依赖容器），
#    因此这个脚本只有在**引入 Testcontainers 集成测试之后**才需要。留着是因为
#    macOS 上这一步的坑不好排查，且脚本自包含、无副作用。
#
# 背景：macOS 上 podman machine 的 Docker socket 在 VM 内部，本机没有 /var/run/docker.sock，
# Testcontainers 直接运行会报 "Could not find a valid Docker environment"。
#
# 关键事实（实测 podman 5.8.1）：podman machine 启动时 gvproxy 会在**宿主侧**创建一个
# Docker-compat API socket（$TMPDIR/podman/<machine>-api.sock）。该 socket 上
# /v1.41/_ping、/v1.41/version、/v1.41/containers/json 均返回 200，
# 正是 Testcontainers 实际调用的 Docker-compat 端点，因此可以直接用作 DOCKER_HOST。
#
# 为什么不用 ssh -L 隧道：该 socket 的生命周期属于 podman machine 本身，不属于任何
# worktree 或测试进程 —— machine 起着 socket 就在，无需 start/stop，多个 worktree 可并行共用。
#
# 用法：
#   scripts/podman-testcontainers.sh host     # 只打印 unix:///... （供命令替换使用）
#   scripts/podman-testcontainers.sh env      # 打印 DOCKER_HOST 与推荐运行命令
#   scripts/podman-testcontainers.sh status   # 检查 socket 是否可用
#   scripts/podman-testcontainers.sh start    # 兼容旧文档：等价于 env
#   scripts/podman-testcontainers.sh stop     # 兼容旧文档：no-op（无隧道可关）
#
# 环境变量：
#   PODMAN_MACHINE  指定 machine 名称，默认 podman-machine-default

MACHINE="${PODMAN_MACHINE:-podman-machine-default}"

# 从 podman 自身查询宿主侧 socket 路径。
# 禁止硬编码：该路径含 per-user 临时目录（$TMPDIR），且随 machine 名称变化。
socket_path() {
  podman machine inspect "${MACHINE}" \
    --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null
}

# 用 Testcontainers 实际调用的 Docker-compat 端点探活，而不是 libpod 端点：
# libpod 可用不代表 docker-compat 可用，必须按消费方视角验证。
api_alive() {
  curl -sfS --max-time 3 --unix-socket "$1" "http://d/v1.41/_ping" >/dev/null 2>&1
}

resolve_or_die() {
  local sock
  sock="$(socket_path)"

  if [[ -z "${sock}" ]]; then
    echo "错误：无法从 podman machine '${MACHINE}' 读取 socket 路径。" >&2
    echo "      请确认 machine 存在并已启动：podman machine start ${MACHINE}" >&2
    exit 1
  fi

  if [[ ! -S "${sock}" ]]; then
    echo "错误：socket 不存在或不是 socket 文件：${sock}" >&2
    echo "      machine 可能未运行，请执行：podman machine start ${MACHINE}" >&2
    exit 1
  fi

  if ! api_alive "${sock}"; then
    echo "错误：socket 存在但 Docker-compat API 无响应：${sock}" >&2
    echo "      请检查 machine 状态：podman machine list" >&2
    exit 1
  fi

  printf '%s' "${sock}"
}

host() {
  printf 'unix://%s\n' "$(resolve_or_die)"
}

env_info() {
  local sock docker_host
  sock="$(resolve_or_die)"
  docker_host="unix://${sock}"

  cat <<EOF

Docker-compat socket 可用（podman machine: ${MACHINE}）：

  DOCKER_HOST=${docker_host}

运行 Testcontainers 测试（Testcontainers 读环境变量 DOCKER_HOST）：

  export DOCKER_HOST="\$(scripts/podman-testcontainers.sh host)"
  ./gradlew test --no-daemon          # --no-daemon 的单次 JVM 才会继承这里 export 的变量

无需 start / stop：该 socket 由 podman machine 持有，多个 worktree 可并行共用。
EOF
}

status() {
  local sock
  sock="$(socket_path)"

  if [[ -n "${sock}" ]] && [[ -S "${sock}" ]] && api_alive "${sock}"; then
    echo "socket 可用：unix://${sock}"
    return 0
  fi

  echo "socket 不可用（machine: ${MACHINE}），请执行：podman machine start ${MACHINE}" >&2
  exit 1
}

case "${1:-}" in
  host) host ;;
  env | start) env_info ;;
  stop)
    echo "无需关闭：已改用 podman machine 的宿主侧 socket，不再建立 ssh 隧道。"
    ;;
  status) status ;;
  *)
    echo "用法：$0 {host|env|status|start|stop}" >&2
    exit 1
    ;;
esac
