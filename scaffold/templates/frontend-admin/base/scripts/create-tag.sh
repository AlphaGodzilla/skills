#!/usr/bin/env bash
# 交互式创建 SemVer git tag：<type>/v<major>.<minor>.<patch>，可选推送到远程。
#
# 用法：
#   scripts/create-tag.sh
#
# tag 类型默认取当前分支名（例如分支 dev → dev/v0.1.0）；类型只允许字母、数字、点、下划线与连字符。
# 需要交互终端：本脚本用 read 询问类型、递增方式与是否推送，非交互环境直接报错退出。

set -euo pipefail

if [[ ! -t 0 ]]; then
    echo "错误：本脚本需要交互终端（会用 read 询问 tag 类型、递增方式与是否推送）。" >&2
    echo "      非交互场景请直接使用：git tag <type>/vX.Y.Z" >&2
    exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "错误：当前目录不是 git 仓库。" >&2
    exit 1
fi

# 无远程仓库时 fetch 会失败，但它只是为了让本地 tag 列表更全，不应中断流程
git fetch --tags >/dev/null 2>&1 || echo "提示：git fetch --tags 未成功（可能没有远程仓库），按本地 tag 计算版本" >&2

echo '======================================'

# 1. 输入 tag 类型，标签格式为: <type>/v<major>.<minor>.<patch>
default_type="$(git branch --show-current || true)"
default_type="${default_type:-dev}"
read -rp "请输入 tag 类型 [${default_type}]: " tag_type
tag_type="${tag_type:-$default_type}"

if [[ -z "$tag_type" ]]; then
    echo "错误: tag 类型不能为空"
    exit 1
fi

if [[ ! "$tag_type" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "错误: tag 类型只能包含字母、数字、点、下划线和连字符"
    exit 1
fi

prefix="${tag_type}/v"

# 2. 匹配已有 tag，找到最大 SemVer 版本号
matched_tags=$(git tag --list "${prefix}*" | grep -E "^${tag_type}/v[0-9]+\.[0-9]+\.[0-9]+$" || true)

if [[ -z "$matched_tags" ]]; then
    echo "未找到类型为 '${tag_type}' 的 tag，将从 ${prefix}0.0.0 开始"
    major=0
    minor=0
    patch=0
else
    echo "已匹配的 tag:"
    echo "$matched_tags" | sort -V | tail -10
    echo ""

    latest_version=$(echo "$matched_tags" \
        | while read -r tag; do echo "${tag#${prefix}}"; done \
        | sort -t. -k1,1n -k2,2n -k3,3n \
        | tail -1)

    major=$(echo "$latest_version" | cut -d. -f1)
    minor=$(echo "$latest_version" | cut -d. -f2)
    patch=$(echo "$latest_version" | cut -d. -f3)

    echo "当前最大版本: ${prefix}${major}.${minor}.${patch}"
fi

# 3. 选择版本号递增方式
echo ""
echo "请选择版本号递增方式:"
echo "  1) 主版本号 +1 -> ${prefix}$((major + 1)).0.0"
echo "  2) 次版本号 +1 -> ${prefix}${major}.$((minor + 1)).0"
echo "  3) 修订号   +1 -> ${prefix}${major}.${minor}.$((patch + 1))"
read -rp "请输入选项 [1/2/3]: " choice

case "$choice" in
    1) new_tag="${prefix}$((major + 1)).0.0" ;;
    2) new_tag="${prefix}${major}.$((minor + 1)).0" ;;
    3) new_tag="${prefix}${major}.${minor}.$((patch + 1))" ;;
    *)
        echo "错误: 无效选项"
        exit 1
        ;;
esac

# 4. 创建 tag
echo ""
read -rp "即将创建 tag: ${new_tag}，确认？[Y/n]: " confirm
confirm=${confirm:-Y}

if [[ "$confirm" =~ ^[Yy]$ ]]; then
    git tag "$new_tag"
    echo "已创建 tag: ${new_tag}"

    read -rp "是否推送该 tag 到远程？[y/N]: " push_confirm
    push_confirm=${push_confirm:-N}
    if [[ "$push_confirm" =~ ^[Yy]$ ]]; then
        git push origin "$new_tag"
        echo "已推送 tag: ${new_tag}"
    else
        echo "跳过推送"
    fi
else
    echo "已取消"
fi
