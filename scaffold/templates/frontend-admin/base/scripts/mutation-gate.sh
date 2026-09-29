#!/usr/bin/env bash
# 变异测试门禁（**可选**）：默认不参与 npm run verify，只有显式运行本脚本（或 npm run mutation）才执行。
#
# 用法：
#   scripts/mutation-gate.sh                        # 只变异「相对基线变更的源码文件」（基线依次尝试 origin/main → origin/master → HEAD）
#   scripts/mutation-gate.sh --all                  # 变异 stryker.config.json 的全部目标；慢，用于夜间全量
#   scripts/mutation-gate.sh --file src/utils/format.ts   # 只变异指定文件；可重复出现
#   scripts/mutation-gate.sh --base origin/dev      # 指定比较基线
#   scripts/mutation-gate.sh --max-survivors 3      # 覆盖 mutation.survivorsMax
#   scripts/mutation-gate.sh --min-score 80         # 覆盖 mutation.scoreMin（百分数）
#   scripts/mutation-gate.sh --allow-no-coverage    # 零覆盖变异体不算失败
#   scripts/mutation-gate.sh --incremental          # 复用上次结果（快，但结果可能过时；只用于本地迭代）
#
# 门禁判据（只针对本次实际被变异的文件）：
#   · 存活变异体数 ≤ mutation.survivorsMax（默认 0：一个都不许活）
#   · 变异得分 ≥ mutation.scoreMin（默认 0：不按分数判定）
#   · mutation.failOnNoCoverage=true（默认）时，零覆盖变异体也判失败
#   · 本次范围内一个变异体都没产生（路径写错、或该文件被 mutate 排除）→ 也判失败，避免「什么都没测却亮绿灯」
#
# 与其它脚本的分工：
#   qa-gate.sh     提交前验收（格式 / 类型 / antd 用法 / 测试与覆盖率 / CRAP），不跑变异测试
#   本脚本         可选的变异测试门禁，慢；建议放在夜间或改动核心逻辑时手动跑
#
# 报告：reports/mutation/index.html（人读）、reports/mutation/mutation.json（agent 解析）
# 日志：reports/mutation/gate.log
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

REPORT_DIR="reports/mutation"
JSON="${REPORT_DIR}/mutation.json"
LOG="${REPORT_DIR}/gate.log"
INCREMENTAL="${REPORT_DIR}/stryker-incremental.json"
TSV="${REPORT_DIR}/gate.tsv"
mkdir -p "${REPORT_DIR}"

MODE="changed"
BASE_REF=""
FILES=()
MAX_SURVIVORS=""
MIN_SCORE=""
ALLOW_NO_COVERAGE=0
INCREMENTAL_RUN=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all) MODE="all" ;;
        --file) MODE="file"; FILES+=("$2"); shift ;;
        --base) BASE_REF="$2"; shift ;;
        --max-survivors) MAX_SURVIVORS="$2"; shift ;;
        --min-score) MIN_SCORE="$2"; shift ;;
        --allow-no-coverage) ALLOW_NO_COVERAGE=1 ;;
        --incremental) INCREMENTAL_RUN=1 ;;
        -h|--help)
            sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "未知参数：$1（用 --help 看用法）" >&2
            exit 2 ;;
    esac
    shift
done

# 阈值：命令行优先，其次 gate.config.json（与覆盖率、CRAP 门禁同一份文件）。
setting() {
    local path="$1" fallback="$2" value
    value="$(node -e "
        const fs = require('node:fs');
        const gate = JSON.parse(fs.readFileSync('${ROOT_DIR}/gate.config.json', 'utf8'));
        const found = '${path}'.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), gate);
        process.stdout.write(found === undefined ? '' : String(found));
    " 2>/dev/null || true)"
    if [[ -n "${value}" ]]; then printf '%s' "${value}"; else printf '%s' "${fallback}"; fi
}

[[ -n "${MAX_SURVIVORS}" ]] || MAX_SURVIVORS="$(setting mutation.survivorsMax 0)"
[[ -n "${MIN_SCORE}" ]] || MIN_SCORE="$(setting mutation.scoreMin 0)"
FAIL_ON_NO_COVERAGE="$(setting mutation.failOnNoCoverage true)"
if [[ ${ALLOW_NO_COVERAGE} -eq 1 ]]; then FAIL_ON_NO_COVERAGE="false"; fi

# ── 目标文件 ───────────────────────────────────────────────────
# 只变异业务源码：测试文件与类型声明不参与（stryker.config.json 的 mutate 也是同一口径）。
SOURCE_FILTER='^src/.*\.(ts|tsx)$'

# 把 --file 的取值整理成 Stryker 的 --mutate 口径：
#   · 目录要展开成 glob（Stryker 不认裸目录，会「找不到文件」并提前退出）；
#   · 路径必须存在，写错时立刻报错，而不是让 Stryker 抛一句与范围无关的「No tests were executed」。
normalize_scope() {
    local entry expanded=() missing=()
    for entry in "$@"; do
        if [[ -d "${entry}" ]]; then
            # 注意：Stryker 的 --mutate 是逗号分隔的，`{ts,tsx}` 会被逗号切成两半，
            # 因此目录要展开成两个独立条目，不能用花括号 glob。
            # 注意：`--mutate` 会**整体替换** stryker.config.json 的 mutate 清单，所以配置里的排除项
            # （测试文件、类型声明、呈现层）在这里必须自己带上，否则会把测试文件也变异一遍。
            expanded+=(
                "${entry}/**/*.ts"
                "${entry}/**/*.tsx"
                "!${entry}/**/*.test.ts"
                "!${entry}/**/*.test.tsx"
                "!${entry}/**/*.d.ts"
            )
        elif [[ -f "${entry}" ]]; then
            expanded+=("${entry}")
        else
            missing+=("${entry}")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "✗ 范围里有不存在的路径：${missing[*]}" >&2
        return 1
    fi
    printf '%s' "$(printf '%s\n' ${expanded[@]+"${expanded[@]}"} | paste -sd, -)"
}

changed_sources() {
    node scripts/changed-files.mjs "$@" --filter "${SOURCE_FILTER}" 2>/dev/null |
        grep -v -E '\.(test|spec)\.(ts|tsx)$' |
        grep -v -E '\.d\.ts$' || true
}

TARGETS=""
TARGET_DESC=""
case "${MODE}" in
    all)
        TARGET_DESC="stryker.config.json 的全部目标（全量）"
        ;;
    file)
        if ! TARGETS="$(normalize_scope ${FILES[@]+"${FILES[@]}"})"; then exit 2; fi
        TARGET_DESC="指定路径：${TARGETS}"
        ;;
    changed)
        BASE="$(node scripts/changed-files.mjs --print-base)"
        if [[ "${BASE}" == "(非 git 仓库)" || "${BASE}" == "(无基线)" ]]; then
            echo "⚠️  ${BASE}，没有可用的比较基线；本次按全量目标执行。"
            echo "    下次可显式指定：scripts/mutation-gate.sh --file <源文件>"
            TARGET_DESC="全部目标（无基线可用）"
        else
            if [[ -n "${BASE_REF}" ]]; then
                TARGETS="$(changed_sources --base "${BASE_REF}" | paste -sd, -)"
                BASE="${BASE_REF}"
            else
                TARGETS="$(changed_sources | paste -sd, -)"
            fi
            if [[ -z "${TARGETS}" ]]; then
                echo "✓ 相对 ${BASE} 没有变更的源码文件，无需变异测试。"
                exit 0
            fi
            TARGET_DESC="相对 ${BASE} 变更的源码文件"
        fi
        ;;
esac

STRYKER_BIN="node_modules/@stryker-mutator/core/bin/stryker.js"
if [[ ! -f "${STRYKER_BIN}" ]]; then
    echo "✗ 找不到 Stryker（${STRYKER_BIN}）。先执行：npm install" >&2
    exit 2
fi

# 增量缓存是「跨次累加」的：上一次范围外的结果也会被写进报告，而且实测出现过
# 「同一个文件、测试已经补过，复用的旧结果仍报存活」的情况。门禁的结论必须可复现，
# 所以默认清掉缓存跑本次范围；--incremental 才复用（只用于本地快速迭代）。
if [[ ${INCREMENTAL_RUN} -eq 0 && -f "${INCREMENTAL}" ]]; then
    rm -f "${INCREMENTAL}"
fi

echo "▸ 变异测试门禁（可选，不属于 npm run verify）"
echo "  · 范围：${TARGET_DESC}"
if [[ -n "${TARGETS}" && "${MODE}" != "changed" ]]; then
    echo "  · 目标：${TARGETS}"
fi
echo "  · 阈值：存活 ≤ ${MAX_SURVIVORS}，得分 ≥ ${MIN_SCORE}%，零覆盖判失败=${FAIL_ON_NO_COVERAGE}"

# Stryker 的 sandbox 预处理要调用 TypeScript 的 JS 编译器 API，而项目用的是 TS 7（tsgo）。
# --import 只为这个进程注册解析钩子，把 typescript 指到兼容内核；项目自身仍用 TS 7。
STRYKER_ARGS=(run --reporters clear-text,json,html)
if [[ -n "${TARGETS}" ]]; then STRYKER_ARGS+=(--mutate "${TARGETS}"); fi
if [[ ${INCREMENTAL_RUN} -eq 1 ]]; then STRYKER_ARGS+=(--incremental); fi

if [[ ${INCREMENTAL_RUN} -eq 1 ]]; then
    echo "  · 增量模式：可能复用上次结果，结论不作为门禁通过的依据"
fi
# 先删掉旧报告：否则 Stryker 起不来时（配置写错、依赖缺失）会读到上一次的陈旧报告，
# 把「上一次通过」当成「这一次通过」——门禁绝不能有这种假通过。
rm -f "${JSON}"
set +e
node --import ./scripts/stryker-ts-compat-register.mjs "${STRYKER_BIN}" "${STRYKER_ARGS[@]}" > "${LOG}" 2>&1
stryker_status=$?
set -e

if [[ ! -f "${JSON}" ]]; then
    echo
    echo "✗ 变异测试未产出报告（stryker 退出码 ${stryker_status}）"
    echo "  常见原因（Stryker 自己的报错常常指向别处）："
    echo "    · 范围路径没匹配到文件：目录要写成 glob（本脚本已自动展开），文件要写成相对仓库根的路径；"
    echo "    · 该文件落在 stryker.config.json 的 mutate 排除项里（呈现层刻意不纳入变异，见 docs/scaffold/development.md）。"
    echo "  日志尾部（完整日志：${LOG}）："
    tail -n 25 "${LOG}" | sed 's/^/  /'
    exit 1
fi

# ── 解析 mutation.json ────────────────────────────────────────
# 用 node 解析而不是 jq：这是一个 Node 项目，node 必然在场，jq 不保证。
# 第二个参数是本次范围内的文件清单（逗号分隔）：增量报告里可能带着上一次的范围外结果，
# 只把「具体文件路径」交给过滤器比对；范围里带通配符（目录展开成的 glob）时无法逐条比对，
# 就不过滤——报告在每次运行前都会被删掉，不存在读到陈旧结果的可能。
SCOPE_FILTER="${TARGETS}"
case "${TARGETS}" in
    *'*'*|*'?'*|*'['*|*'{'*) SCOPE_FILTER="" ;;
esac
# 判据只认范围内的，否则「改了 3 个文件」却按全量裁决定生死。
node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    // 范围条目要做路径规范化再比对：`./src/utils/format.ts` 与报告里的 `src/utils/format.ts` 必须算同一个，
    // 否则「指定了某个文件、却匹配不到任何变异体」会被当成 100% 通过（假通过）。
    const normalize = (value) => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    const scope = (process.argv[2] ?? "").split(",").map(normalize).filter(Boolean);
    const inScope = (file) => {
        const normalized = normalize(file);
        // 允许给目录（如 src/utils），因此既比全等也比前缀
        return scope.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`));
    };
    const rows = [];
    let skipped = 0;
    for (const [file, entry] of Object.entries(report.files ?? {})) {
        if (scope.length > 0 && !inScope(file)) {
            skipped += (entry.mutants ?? []).length;
            continue;
        }
        for (const mutant of entry.mutants ?? []) {
            rows.push([
                mutant.status,
                file,
                mutant.location?.start?.line ?? 0,
                mutant.mutatorName,
                (mutant.replacement ?? "").replace(/\t|\n/g, " ").slice(0, 80),
                (mutant.statusReason ?? "").replace(/\t|\n/g, " ").slice(0, 160),
            ].join("\t"));
        }
    }
    process.stdout.write(rows.length ? rows.join("\n") + "\n" : "");
    if (skipped > 0) {
        process.stderr.write(`  · 已忽略 ${skipped} 个不在本次范围内的历史结果（增量报告是累加的）\n`);
    }
' "${JSON}" "${SCOPE_FILTER}" > "${TSV}"

total="$(wc -l < "${TSV}" | tr -d ' ')"
count_status() { awk -F'\t' -v s="$1" '$1 == s' "${TSV}" | wc -l | tr -d ' '; }

# 范围内一个变异体都没有时**判失败**，而不是「0 个变异体 / 100% 通过」：
# 那通常是范围写错了（路径不对，或该文件被 stryker.config.json 的 mutate 排除），
# 静默通过会让门禁在「其实什么都没测」的情况下亮绿灯。
if [[ "${total}" -eq 0 ]]; then
    echo
    echo "✗ 本次范围内没有产生任何变异体（${TARGET_DESC}）"
    echo "  · 范围条目：${TARGETS:-<stryker.config.json 的 mutate 清单>}"
    echo "  · 常见原因：路径写错；或该文件落在 mutate 排除项里（src/locales/**、src/pages/**/index.tsx、"
    echo "    src/components/** 等呈现层刻意不纳入变异，见 docs/scaffold/development.md）。"
    echo "  · 完整日志：${LOG}"
    exit 1
fi
killed="$(count_status Killed)"
timed_out="$(count_status Timeout)"
survived="$(count_status Survived)"
no_coverage="$(count_status NoCoverage)"
compile_error="$(count_status CompileError)"
runtime_error="$(count_status RuntimeError)"
ignored="$(count_status Ignored)"
killed_total=$((killed + timed_out + runtime_error + compile_error))
scored=$((total - ignored))
score="$(awk -v k="${killed_total}" -v s="${scored}" 'BEGIN { printf "%.1f", (s > 0 ? k * 100 / s : 100) }')"

echo
echo "▸ 变异结果（范围：${TARGET_DESC}）"
echo "  · 变异体 ${total} 个：killed ${killed_total}（含超时 ${timed_out}）、survived ${survived}、零覆盖 ${no_coverage}、忽略 ${ignored}"
echo "  · 变异得分 ${score}%（killed / 可评分变异体）"

if [[ "${survived}" -gt 0 ]]; then
    echo "  · 存活变异体（测试没抓住的缺陷）："
    awk -F'\t' '$1 == "Survived" { printf "      %s:%s  %s\n        → 被改写成：%s\n        %s\n", $2, $3, $4, $5, $6 }' "${TSV}"
fi
if [[ "${no_coverage}" -gt 0 ]]; then
    echo "  · 零覆盖变异体（这些代码没有被任何测试执行到）："
    awk -F'\t' '$1 == "NoCoverage" { printf "      %s:%s  %s\n", $2, $3, $4 }' "${TSV}" | head -10
fi

echo "  · 报告：${REPORT_DIR}/index.html（人读）、${JSON}（agent 解析）"
echo "  · 日志：${LOG}"

# ── 判定 ─────────────────────────────────────────────────────
failed=0
if [[ "${survived}" -gt "${MAX_SURVIVORS}" ]]; then
    failed=1
    echo "  ✗ 存活变异体 ${survived} 个 > 上限 ${MAX_SURVIVORS}"
fi
if awk -v s="${score}" -v m="${MIN_SCORE}" 'BEGIN { exit !(s + 0 < m + 0) }'; then
    failed=1
    echo "  ✗ 变异得分 ${score}% < 下限 ${MIN_SCORE}%"
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
  · 存活变异体 = 测试跑到了但没断言住这个行为：给对应函数补断言，而不是只提高行覆盖。
  · 边界类存活（如 <= 被改成 <）：补边界值用例（边界、边界±1）。
  · 零覆盖变异体：这段代码没被测到；先补用例。确实是框架装配或生成代码时，
    在 stryker.config.json 的 mutate 里排除它，而不是降低阈值。
  · 具体位置见上面列出的 文件:行号，以及 reports/mutation/index.html。
  · 阈值改放：--max-survivors / --min-score，并同步改 gate.config.json 的 mutation 段。
TXT
exit 1
