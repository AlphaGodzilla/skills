#!/usr/bin/env bash
# 变异测试门禁（可选）：默认不参与 ./gradlew build，只有显式运行本脚本（或 ./gradlew pitest）才执行。
#
# 用法：
#   scripts/mutation-gate.sh                      # 只变异「相对基线变更的类」（基线依次尝试 origin/main → origin/master → HEAD）
#   scripts/mutation-gate.sh --all                # 变异 gradle 默认目标（全部业务包）；慢，用于夜间全量
#   scripts/mutation-gate.sh --class a.b.C        # 只变异指定类；可重复出现
#   scripts/mutation-gate.sh --base origin/dev    # 指定比较基线
#   scripts/mutation-gate.sh --max-survivors 3    # 覆盖 mutationSurvivorsMax
#   scripts/mutation-gate.sh --min-score 0.8      # 覆盖 mutationScoreMin
#   scripts/mutation-gate.sh --allow-no-coverage  # 零覆盖变异体不算失败
#
# 门禁判据（只针对本次实际被变异的类）：
#   · 存活变异体数 ≤ mutationSurvivorsMax（默认 0：一个都不许活）
#   · 变异得分 ≥ mutationScoreMin（默认 0：不按分数判定）
#   · mutationFailOnNoCoverage=true（默认）时，零覆盖变异体也判失败
#
# 与其它脚本的分工：
#   qa-gate.sh     提交前验收（build：测试 / 架构 / 格式 / 覆盖率 / CRAP），不跑变异测试
#   本脚本         可选的变异测试门禁，慢；建议放在夜间或改动核心域时手动跑
#
# 报告：build/reports/pitest/index.html（人读）、build/reports/pitest/mutations.xml（agent 解析）
# 日志：build/mutation-gate.log
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

LOG="${ROOT_DIR}/build/mutation-gate.log"
REPORT_DIR="build/reports/pitest"
XML="${REPORT_DIR}/mutations.xml"
TSV="${ROOT_DIR}/build/mutation-gate.tsv"
mkdir -p "${ROOT_DIR}/build"

MODE="changed"
BASE_REF=""
CLASSES=()
MAX_SURVIVORS=""
MIN_SCORE=""
ALLOW_NO_COVERAGE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all) MODE="all" ;;
        --class) MODE="class"; CLASSES+=("$2"); shift ;;
        --base) BASE_REF="$2"; shift ;;
        --max-survivors) MAX_SURVIVORS="$2"; shift ;;
        --min-score) MIN_SCORE="$2"; shift ;;
        --allow-no-coverage) ALLOW_NO_COVERAGE=1 ;;
        -h|--help)
            sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "未知参数：$1（用 --help 看用法）" >&2
            exit 2 ;;
    esac
    shift
done

# 阈值：命令行 -P 优先，其次 gradle.properties，最后与 build.gradle.kts 的内置默认值一致。
setting() {
    local name="$1" fallback="$2" value
    if [[ -f "${ROOT_DIR}/gradle.properties" ]]; then
        value="$(grep -E "^${name}=" "${ROOT_DIR}/gradle.properties" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
        if [[ -n "${value}" ]]; then printf '%s' "${value}" && return 0; fi
    fi
    printf '%s' "${fallback}"
}

[[ -n "${MAX_SURVIVORS}" ]] || MAX_SURVIVORS="$(setting mutationSurvivorsMax 0)"
[[ -n "${MIN_SCORE}" ]] || MIN_SCORE="$(setting mutationScoreMin 0.0)"
FAIL_ON_NO_COVERAGE="$(setting mutationFailOnNoCoverage true)"
if [[ ${ALLOW_NO_COVERAGE} -eq 1 ]]; then FAIL_ON_NO_COVERAGE="false"; fi

# ── 目标类 ───────────────────────────────────────────────────
resolve_base_ref() {
    if [[ -n "${BASE_REF}" ]]; then printf '%s' "${BASE_REF}" && return 0; fi
    local candidate
    for candidate in origin/main origin/master; do
        if git rev-parse --verify --quiet "${candidate}" >/dev/null 2>&1; then
            printf '%s' "${candidate}" && return 0
        fi
    done
    if git rev-parse --verify --quiet HEAD >/dev/null 2>&1; then printf 'HEAD' && return 0; fi
    return 1
}

changed_classes() {
    local base="$1"
    # 已提交 + 工作区改动（不加 ...HEAD，这样本地未提交的改动也算）；再补未跟踪的新文件。
    {
        git diff --name-only --diff-filter=ACMR "${base}" -- 'src/main/java/**/*.java' 2>/dev/null || true
        git ls-files --others --exclude-standard -- 'src/main/java/**/*.java' 2>/dev/null || true
    } | sort -u |
        sed -E 's#^src/main/java/##; s#\.java$##; s#/#.#g' |
        grep -v 'package-info$' || true
}

TARGETS=""
TARGET_DESC=""
case "${MODE}" in
    all)
        TARGET_DESC="gradle 默认目标（全部业务包）"
        ;;
    class)
        TARGETS="$(printf '%s\n' "${CLASSES[@]}" | paste -sd, -)"
        TARGET_DESC="指定类：${TARGETS}"
        ;;
    changed)
        if ! BASE="$(resolve_base_ref)"; then
            echo "⚠️  仓库还没有任何提交，无法计算「变更的类」；本次按全量目标执行。"
            echo "    下次可显式指定：scripts/mutation-gate.sh --class <全限定类名>"
            TARGET_DESC="gradle 默认目标（无基线可用）"
        else
            TARGETS="$(changed_classes "${BASE}" | paste -sd, -)"
            if [[ -z "${TARGETS}" ]]; then
                echo "✓ 相对 ${BASE} 没有变更的 src/main/java 类，无需变异测试。"
                exit 0
            fi
            TARGET_DESC="相对 ${BASE} 变更的类：${TARGETS}"
        fi
        ;;
esac

THREADS="$(setting pitestThreads 4)"

echo "▸ 变异测试门禁（可选，不属于 ./gradlew build）"
echo "  · 范围：${TARGET_DESC}"
echo "  · 阈值：存活 ≤ ${MAX_SURVIVORS}，得分 ≥ ${MIN_SCORE}，零覆盖判失败=${FAIL_ON_NO_COVERAGE}"
echo "  · 线程：${THREADS}"

GRADLE_ARGS=(--console=plain pitest -PpitestThreads="${THREADS}")
GRADLE_ARGS+=(-PmutationSurvivorsMax="${MAX_SURVIVORS}" -PmutationScoreMin="${MIN_SCORE}")
if [[ -n "${TARGETS}" ]]; then GRADLE_ARGS+=(-PpitestTargetClasses="${TARGETS}"); fi

set +e
./gradlew "${GRADLE_ARGS[@]}" > "${LOG}" 2>&1
gradle_status=$?
set -e

if [[ ! -f "${XML}" ]]; then
    echo
    echo "✗ 变异测试未产出报告（./gradlew pitest 退出码 ${gradle_status}）"
    echo "  日志尾部（完整日志：build/mutation-gate.log）："
    tail -n 25 "${LOG}" | sed 's/^/  /'
    exit 1
fi

# ── 解析 mutations.xml ───────────────────────────────────────
# PIT 的 XML 属性用单引号；每个 <mutation>...</mutation> 占一行，故按行解析即可。
awk '
    /<mutation / {
        status = ""; cls = ""; meth = ""; line = ""; mut = ""; desc = "";
        if (match($0, /status='"'"'[A-Z_]+'"'"'/)) status = substr($0, RSTART + 8, RLENGTH - 9);
        if (match($0, /<mutatedClass>[^<]*/))      cls  = substr($0, RSTART + 14, RLENGTH - 14);
        if (match($0, /<mutatedMethod>[^<]*/))     meth = substr($0, RSTART + 15, RLENGTH - 15);
        if (match($0, /<lineNumber>[0-9]+/))       line = substr($0, RSTART + 12, RLENGTH - 12);
        if (match($0, /<mutator>[^<]*/))           { mut = substr($0, RSTART + 9, RLENGTH - 9); sub(/.*\./, "", mut); }
        if (match($0, /<description>[^<]*/))       { desc = substr($0, RSTART + 13, RLENGTH - 13); gsub(/&quot;/, "\"", desc); }
        printf "%s\t%s\t%s\t%s\t%s\t%s\n", status, cls, meth, line, mut, desc;
    }
' "${XML}" > "${TSV}"

total="$(wc -l < "${TSV}" | tr -d ' ')"
count_status() { awk -F'\t' -v s="$1" '$1 == s' "${TSV}" | wc -l | tr -d ' '; }
killed="$(count_status KILLED)"
timed_out="$(count_status TIMED_OUT)"
survived="$(count_status SURVIVED)"
no_coverage="$(count_status NO_COVERAGE)"
non_viable="$(count_status NON_VIABLE)"
killed_total=$((killed + timed_out))
scored=$((total - non_viable))
score="$(awk -v k="${killed_total}" -v s="${scored}" 'BEGIN { printf "%.1f", (s > 0 ? k * 100 / s : 100) }')"

source_file_for() {
    local fqcn="$1" rel
    fqcn="${fqcn%%\$*}"
    rel="src/main/java/$(printf '%s' "${fqcn}" | tr '.' '/').java"
    if [[ -f "${ROOT_DIR}/${rel}" ]]; then printf '%s' "${rel}"; fi
}

echo
echo "▸ 变异结果（范围：${TARGET_DESC}）"
echo "  · 变异体 ${total} 个：killed ${killed_total}（含超时 ${timed_out}）、survived ${survived}、零覆盖 ${no_coverage}、不可存活 ${non_viable}"
echo "  · 变异得分 ${score}%（killed / 可评分变异体）"

if [[ "${survived}" -gt 0 ]]; then
    echo "  · 存活变异体（测试没抓住的缺陷）："
    awk -F'\t' '$1 == "SURVIVED" { printf "      %s.%s:%s  %s\n        %s\n", $2, $3, $4, $5, $6 }' "${TSV}"
fi
if [[ "${no_coverage}" -gt 0 ]]; then
    echo "  · 零覆盖变异体（这些代码没有被任何测试执行到）："
    awk -F'\t' '$1 == "NO_COVERAGE" { printf "      %s.%s:%s  %s\n", $2, $3, $4, $5 }' "${TSV}" | head -10
fi

echo "  · 报告：${REPORT_DIR}/index.html（人读）、${XML}（agent 解析）"
echo "  · 日志：build/mutation-gate.log"

# ── 判定 ─────────────────────────────────────────────────────
failed=0
if [[ "${survived}" -gt "${MAX_SURVIVORS}" ]]; then
    failed=1
    echo "  ✗ 存活变异体 ${survived} 个 > 上限 ${MAX_SURVIVORS}"
fi
if awk -v s="${score}" -v m="${MIN_SCORE}" 'BEGIN { exit !(s + 0 < m + 0) }'; then
    failed=1
    echo "  ✗ 变异得分 ${score}% < 下限 ${MIN_SCORE}"
fi
if [[ "${FAIL_ON_NO_COVERAGE}" == "true" && "${no_coverage}" -gt 0 ]]; then
    failed=1
    echo "  ✗ 存在 ${no_coverage} 个零覆盖变异体（要放过用 --allow-no-coverage）"
fi

if [[ ${failed} -eq 0 ]]; then
    echo "✓ 变异测试门禁通过"
    exit 0
fi

cat <<'TXT'

修法（改被测代码或测试，不要放宽阈值）：
  · killed 不了的变异体 = 测试没断言到该行为：为对应方法补断言，而不是只提高行覆盖。
  · 条件边界存活（如 <= 被改成 <）：补边界值用例（边界值、边界±1）。
  · 零覆盖变异体：该分支没被测到，补用例；若是 Getter/toString 之类无业务含义的代码，用
    -PpitestExcludedClasses 或 -PpitestExcludedMethods 排除，而不是降低阈值。
  · 具体位置见上面列出的 类.方法:行号，以及 build/reports/pitest/index.html。
  · 阈值改放：-PmutationSurvivorsMax=<n> / -PmutationScoreMin=<p>，并同步改 gradle.properties。
TXT
exit 1
