#!/usr/bin/env bash
# 加载可选的环境文件，供 dev-run.sh / dev-test.sh / dev-it.sh 复用。
#
# 用法：在脚本里 source 本文件，再调用 load_env <项目根目录>
#
# 读取 <项目根>/.env（可选；模板见 .env.example）。
# **优先级：调用方显式传入的环境变量 > .env**（与 Spring Boot 的 env > 配置文件的直觉一致）：
# 因此 `DB_HOST_PORT=5432 scripts/dev-it.sh` 能覆盖 .env 里的值，而不是被它悄悄盖掉。
# 返回值：0 = 已读取；1 = 文件不存在（调用方自行决定是否容忍：内置默认值都能让项目跑起来）。

load_env() {
  local root_dir="$1"
  local env_file="${root_dir}/.env"

  if [[ ! -f "${env_file}" ]]; then
    echo "未找到 ${env_file}（可选；模板见 .env.example），使用内置默认值" >&2
    return 1
  fi

  echo "加载环境变量：${env_file}（已由环境显式设置的不被覆盖）"

  local line key value
  while IFS= read -r line || [[ -n "${line}" ]]; do
    # 跳过空行与注释
    if [[ "${line}" =~ ^[[:space:]]*(#|$) ]]; then
      continue
    fi
    # 允许 `KEY=VALUE` 与 `export KEY=VALUE`
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line#export }"
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "${key}" == "${line}" || -z "${key}" ]]; then
      echo "跳过无法解析的行：${line}" >&2
      continue
    fi
    key="${key%"${key##*[![:space:]]}"}"
    # 去掉值两侧成对的引号
    if [[ "${value}" =~ ^\".*\"$ || "${value}" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi
    # 只填「尚未设置」的变量：显式环境变量优先
    if [[ -z "${!key+x}" ]]; then
      export "${key}=${value}"
    fi
  done < "${env_file}"
}
