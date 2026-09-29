#!/usr/bin/env bash
# 提交前的验收入口：跑五道门禁（格式与静态检查、类型检查、antd 用法检查、测试与覆盖率、CRAP），
# **失败时把「哪一道门禁失败、证据在哪个文件、下一步查什么」打印出来**。
#
# 用法：
#   scripts/qa-gate.sh                       # 完整验收；提交前必须过
#   scripts/qa-gate.sh --all                 # 格式检查改为全量（默认只查相对基线的改动文件）
#   scripts/qa-gate.sh --base origin/dev     # 指定格式检查的比较基线
#
# 与其它脚本的分工：
#   dev-test.sh       日常快速跑测试，不判覆盖率与 CRAP
#   qa-gate.sh        提交前验收：格式 / 类型 / antd 用法 / 测试与覆盖率 / CRAP；**不含**变异测试
#   mutation-gate.sh  可选的变异测试门禁（慢），单独跑
#
# 各道门禁的日志落在 reports/qa-gate/<门禁>.log。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

REPORT_DIR="reports/qa-gate"
FORMAT_LOG="${REPORT_DIR}/format.log"
TYPES_LOG="${REPORT_DIR}/types.log"
TESTS_LOG="${REPORT_DIR}/tests.log"
CRAP_LOG="${REPORT_DIR}/crap.log"
ANTD_LOG="${REPORT_DIR}/antd-lint.log"
mkdir -p "${REPORT_DIR}"

# 从 gate.config.json 读阈值，保证失败时打印的阈值与本次实际生效的一致。
threshold() {
    node -e "
        const fs = require('node:fs');
        const gate = JSON.parse(fs.readFileSync('${ROOT_DIR}/gate.config.json', 'utf8'));
        const found = '$1'.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), gate);
        process.stdout.write(found === undefined ? '' : String(found));
    " 2>/dev/null || true
}

COVERAGE_LINE_MIN="$(threshold coverage.lines)"
CRAP_MAX="$(threshold crap.max)"

GATE_ARGS=("$@")
failed_gates=()

run_gate() {
    local name="$1"; shift
    local log="$1"; shift
    printf '▸ %-22s ' "${name}"
    if "$@" > "${log}" 2>&1; then
        echo '✓'
        return 0
    fi
    echo '✗'
    failed_gates+=("${name}")
    return 1
}

echo "▸ QA 门禁（提交前验收）"
run_gate "格式与静态检查" "${FORMAT_LOG}" node scripts/format-gate.mjs ${GATE_ARGS[@]+"${GATE_ARGS[@]}"} || true
run_gate "类型检查" "${TYPES_LOG}" npm run --silent tsc || true
# antd 用法检查：`npx antd lint` 有违规也返回 0，所以走包装脚本（见 scripts/antd-lint-gate.mjs）
run_gate "antd 用法检查" "${ANTD_LOG}" node scripts/antd-lint-gate.mjs --report reports/qa-gate/antd-lint.json || true
run_gate "测试与覆盖率" "${TESTS_LOG}" npm run --silent test:coverage || true
# 测试失败时覆盖率数据是残缺的，CRAP 的数字不可靠，但仍然跑一次以给出可用线索
run_gate "CRAP" "${CRAP_LOG}" node scripts/crap-report.mjs || true

log_has() { grep -qE "$1" "$2" 2>/dev/null; }
in_failed_gates() { local wanted="$1" item; for item in ${failed_gates[@]+"${failed_gates[@]}"}; do [[ "${item}" == "${wanted}" ]] && return 0; done; return 1; }

if [[ ${#failed_gates[@]} -eq 0 ]]; then
    echo
    echo "✓ QA 门禁通过"
    echo "  · 测试：$(grep -E '^ *Test Files ' "${TESTS_LOG}" | tail -1 | sed 's/^ *//')"
    echo "            $(grep -E '^ *Tests ' "${TESTS_LOG}" | tail -1 | sed 's/^ *//')"
    grep -E '^Lines +:' "${TESTS_LOG}" | sed 's/^/  · 行覆盖 /' || true
    echo "  · CRAP：$(grep -E '^✓ 没有函数超过' "${CRAP_LOG}" | head -1 || echo 'n/a')"
    echo "  · antd 用法：$(grep -E '^✓ antd 用法检查通过' "${ANTD_LOG}" | head -1 || echo 'n/a')"
    echo "  · 报告：coverage/index.html（覆盖率）、reports/crap/crap.txt（CRAP 明细）、reports/qa-gate/antd-lint.json（antd 用法）"
    echo "  · 日志：${REPORT_DIR}/"
    exit 0
fi

echo
echo "✗ QA 门禁未通过：${failed_gates[*]}"

matched=0

# 1) 类型错误：后面所有判定都基于这份类型信息，先修它
if in_failed_gates "类型检查"; then
    matched=1
    echo
    echo "▸ 类型检查失败（tsc --noEmit）：按文件列出第一条错误"
    grep -oE '^[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+: .*' "${TYPES_LOG}" 2>/dev/null |
        awk -F'[(]' '!seen[$1]++' | head -5 | sed 's/^/  · /' || true
    echo "  完整错误：${TYPES_LOG}"
fi

# 2) antd 用法问题：deprecated / a11y / usage / performance，由自带 skill 的 CLI 检出
if in_failed_gates "antd 用法检查"; then
    matched=1
    echo
    echo "▸ antd 用法检查未通过（deprecated / a11y / usage / performance）"
    grep -E '^    ' "${ANTD_LOG}" | head -10 | sed 's/^    /  · /' || true
    echo "  修法：先查当前版本 API（npx antd info <Component>），再改代码；"
    echo "        排查与迁移清单见 .pi/skills/antd/SKILL.md；报告：reports/qa-gate/antd-lint.json"
fi

# 3) 测试失败（架构守护也是普通测试文件，走同一条路径）
if in_failed_gates "测试与覆盖率"; then
    matched=1
    echo
    echo "▸ 测试失败"
    grep -E '^ *FAIL ' "${TESTS_LOG}" | sed 's/^ *FAIL /  · /' | head -10 || true
    grep -E '^ *× ' "${TESTS_LOG}" | sed 's/^ */      × /' | head -10 || true
    echo "  单个文件重跑：npx vitest run <测试文件>"
    case "$(grep -oE 'tests/architecture\.test\.ts|architecture' "${TESTS_LOG}" | head -1)" in
        *architecture*)
            echo "  ↑ 分层依赖守护失败：对照 docs/scaffold/structure.md 的「分层与依赖规则」改被测代码"
            ;;
    esac
    echo "  完整日志：${TESTS_LOG}"
    if log_has '^(Tests|Test Files) .*failed' "${TESTS_LOG}"; then
        echo "  ⚠️ 测试失败时覆盖率与 CRAP 的数字不可靠（采集数据残缺），先修测试再重跑本脚本。"
    fi
fi

# 4) 覆盖率低于下限
if log_has 'does not meet global threshold' "${TESTS_LOG}"; then
    matched=1
    echo
    echo "▸ 覆盖率低于下限（gate.config.json：coverage.lines=${COVERAGE_LINE_MIN}）"
    grep -E 'does not meet global threshold' "${TESTS_LOG}" | sed 's/^/  · /' || true
    echo "  · 行覆盖最低的几处（文件 → 行覆盖）"
    awk -F'|' '$1 ~ /^ / && $6 ~ /[0-9]/ {
        pct = $6; gsub(/ /, "", pct); name = $2; gsub(/^ +| +$/, "", name);
        if (name != "" && pct != "") printf "%s\t%s\n", pct, name;
    }' "${TESTS_LOG}" | sort -n | head -5 | sed 's/^/      /' || true
    echo "  · 报告：coverage/index.html"
fi

# 5) CRAP 超过上限
if log_has '^✗ [0-9]+ 个函数超过' "${CRAP_LOG}"; then
    matched=1
    echo
    echo "▸ CRAP 超过上限（crapMax=${CRAP_MAX}）：圈复杂度高又缺测试"
    grep -E '^  - CRAP=' "${CRAP_LOG}" | sed 's/^  /  ·/' | head -10 || true
    echo "  修法：补单元测试、或把函数拆小（拆复杂度比堆测试更有效）"
    echo "  明细：reports/crap/crap.txt"
fi

# 6) 格式与静态检查违规
if in_failed_gates "格式与静态检查"; then
    matched=1
    echo
    echo "▸ 格式与静态检查违规"
    # biome 两种输出形状：`path:line:col rule` 与 `path format`（纯格式差异没有行列号）
    grep -oE '^[^ ]+\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)(:[0-9]+:[0-9]+)? ' "${FORMAT_LOG}" 2>/dev/null |
        awk '{ print $1 }' | awk -F: '!seen[$1]++' | head -10 | sed 's/^/  · /' || true
    echo "  修法：npm run format（biome check --write，只改写改动文件）"
    echo "  完整输出：${FORMAT_LOG}"
fi

if [[ ${matched} -eq 0 ]]; then
    echo
    echo "▸ 未能归类失败原因，附各门禁日志尾部"
    for log in "${FORMAT_LOG}" "${TYPES_LOG}" "${ANTD_LOG}" "${TESTS_LOG}" "${CRAP_LOG}"; do
        [[ -f "${log}" ]] || continue
        echo "  ── ${log}"
        tail -n 8 "${log}" | sed 's/^/     /'
    done
fi

cat <<'TXT'

───────────────────────────────────────────────
下一步（改被测代码，不要改测试或门禁本身）：
  · 修完重跑：scripts/qa-gate.sh
  · 只看覆盖率：npm run test:coverage（报告在 coverage/index.html）
  · 只看 CRAP：npm run crap（明细在 reports/crap/crap.txt）
  · 只看 antd 用法：npm run antd:lint（明细在 reports/qa-gate/antd-lint.json；写 antd 代码前先查 .pi/skills/antd/SKILL.md）
  · 只重跑一个测试文件：npx vitest run src/utils/format.test.ts
  · 变异测试（可选，慢）：scripts/mutation-gate.sh（默认只变异变更文件；详见 docs/scaffold/development.md）
  · 各门禁日志：reports/qa-gate/

禁止为了让门禁变绿而修改测试套件（测试代码、断言、vi.mock、exclude）、门禁阈值
（gate.config.json 的 coverage 与 crap 段）、stryker.config.json 的排除规则。门禁失败时的正确修法是：
改被测代码，或补测试。确需放宽阈值时单独提交并写明理由。
TXT

exit 1
