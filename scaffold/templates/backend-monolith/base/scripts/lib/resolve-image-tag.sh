#!/usr/bin/env bash
# 从 git tag 解析出镜像发布用的环境与版本，供发布脚本 source 后调用。
#
# tag 约定与 create-tag.sh 一致：<type>/v<major>.<minor>.<patch>
#
#   release/v1.2.3   → IMAGE_ENV=prod  IMAGE_TAG=v1.2.3  GIT_TAG=release/v1.2.3
#   dev/v1.2.3       → IMAGE_ENV=dev   IMAGE_TAG=v1.2.3  GIT_TAG=dev/v1.2.3
#   其它类型前缀      → IMAGE_ENV=dev
#
# 用法（在发布脚本里）：
#   source scripts/lib/resolve-image-tag.sh
#   resolve_image_tag "release/v1.2.3" || exit 1
#   echo "${IMAGE_ENV} ${IMAGE_TAG} ${GIT_TAG}"
#
# 未传参数时进入交互式输入；非交互环境直接报错退出。

resolve_image_tag() {
  local input="${1:-}"

  if [[ -z "${input}" ]]; then
    if [[ ! -t 0 ]]; then
      echo "未指定 tag，且当前不在交互终端，无法提示输入" >&2
      return 1
    fi
    read -r -p "请输入 tag（<type>/vX.Y.Z，例如 dev/v1.0.0 或 release/v1.0.0）: " input
  fi

  local prefix="${input%%/*}"
  local version="${input#*/}"

  if [[ "${prefix}" == "${input}" ]]; then
    echo "缺少类型前缀：${input}（期望形如 dev/v1.0.0 或 release/v1.0.0）" >&2
    return 1
  fi

  local env
  case "${prefix}" in
    release*) env="prod" ;;
    *) env="dev" ;;
  esac

  if [[ ! "${version}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    echo "无效的版本号：${version}（期望形如 v1.0.0 或 v1.0.0-rc1）" >&2
    return 1
  fi

  # 下面三个变量是函数的输出：由调用方在 source 本文件之后读取，因此显式关闭「未使用」告警
  # shellcheck disable=SC2034
  IMAGE_ENV="${env}"
  # shellcheck disable=SC2034
  IMAGE_TAG="${version}"
  # shellcheck disable=SC2034
  GIT_TAG="${prefix}/${version}"
}
