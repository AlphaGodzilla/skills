#!/usr/bin/env bash
# 提交前的验收入口：跑 ./gradlew build（单元与契约测试、ArchUnit 架构守护、Spotless 格式检查、
# 覆盖率下限、CRAP 上限），**失败时把「哪一道门禁失败、证据在哪个文件、下一步查什么」打印出来**。
#
# 用法：
#   scripts/qa-gate.sh                    # 完整验收；提交前必须过
#   scripts/qa-gate.sh --rerun-tasks      # 其余参数原样透传给 gradle（如 --no-daemon）
#   scripts/qa-gate.sh --tests 'com.acme.app.shared.id.UlidTest'   # 只跑某类（调试用，此时不算验收）
#
# 与其它脚本的分工：
#   dev-test.sh   日常快速跑测试，不判覆盖率与 CRAP
#   dev-it.sh     集成测试（podman 起容器）；**本脚本不含集成测试**
#   qa-gate.sh    提交前验收：测试 + 架构 + 格式 + 覆盖率 + CRAP，失败时给定位引导
#
# 完整构建日志落在 build/qa-gate.log（--console=plain，无光标控制字符，可直接 grep）。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

LOG="${ROOT_DIR}/build/qa-gate.log"
JACOCO_XML="build/reports/jacoco/test/jacocoTestReport.xml"
CRAP_TXT="build/reports/crap/crap.txt"
mkdir -p "${ROOT_DIR}/build"

GRADLE_ARGS=("$@")

# 阈值：命令行 -P 优先，其次 gradle.properties，最后与 build.gradle.kts 的内置默认值一致。
# 这样门禁失败时打印的阈值与本次实际生效的一致（含 -P 临时覆盖的情形）。
threshold() {
    local name="$1" fallback="$2" arg value
    for arg in ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"}; do
        case "${arg}" in
            "-P${name}="*) printf '%s' "${arg#-P${name}=}" && return 0 ;;
        esac
    done
    if [[ -f "${ROOT_DIR}/gradle.properties" ]]; then
        value="$(grep -E "^${name}=" "${ROOT_DIR}/gradle.properties" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
        if [[ -n "${value}" ]]; then
            printf '%s' "${value}" && return 0
        fi
    fi
    printf '%s' "${fallback}"
}

COVERAGE_LINE_MIN="$(threshold coverageLineMin 0.65)"
COVERAGE_BRANCH_MIN="$(threshold coverageBranchMin 0.65)"
CRAP_MAX="$(threshold crapMax 30)"

# 从 JaCoCo XML 读整体（bundle）覆盖比：报告级计数器是文件里的最后一组，故取最后一次匹配。
bundle_ratio() {
    local type="$1" hit
    hit="$(grep -o "type=\"${type}\" missed=\"[0-9]*\" covered=\"[0-9]*\"" "${JACOCO_XML}" 2>/dev/null | tail -1)"
    [[ -n "${hit}" ]] || return 0
    printf '%s' "${hit}" | awk '{
        match($0, /missed="[0-9]+"/); m = substr($0, RSTART + 8, RLENGTH - 9);
        match($0, /covered="[0-9]+"/); c = substr($0, RSTART + 9, RLENGTH - 10);
        if (m + c > 0) printf "%.1f", c * 100 / (m + c); else printf "n/a";
    }'
}

# 行覆盖最差的 5 个类：JaCoCo XML 是单行压缩的，先按 </class> 切块，再取每块最后一个行计数器（类级）。
worst_covered_classes() {
    [[ -f "${JACOCO_XML}" ]] || return 0
    sed 's|</class>|\n|g' "${JACOCO_XML}" | awk '
        /<class name="/ {
            name = ""; lastm = ""; lastc = "";
            if (match($0, /<class name="[^"]*"/)) name = substr($0, RSTART + 13, RLENGTH - 14);
            while (match($0, /<counter type="LINE" missed="[0-9]+" covered="[0-9]+"\/>/)) {
                seg = substr($0, RSTART, RLENGTH);
                $0 = substr($0, RSTART + RLENGTH);
                if (match(seg, /missed="[0-9]+"/)) lastm = substr(seg, RSTART + 8, RLENGTH - 9);
                if (match(seg, /covered="[0-9]+"/)) lastc = substr(seg, RSTART + 9, RLENGTH - 10);
            }
            total = lastm + lastc;
            if (name != "" && lastm != "" && total > 0 && lastm > 0)
                printf "%d\t%s\t%d\t%d\n", lastm, name, lastc, total;
        }' | sort -rn | head -5 | while IFS="$(printf '\t')" read -r missed name covered total; do
        printf '  · 未覆盖 %s/%s 行（覆盖 %s%%） %s\n' "${missed}" "${total}" \
            "$(awk -v c="${covered}" -v t="${total}" 'BEGIN{printf "%.1f", c * 100 / t}')" "${name}"
        printf '      源码：%s\n' "$(source_file_for "${name}")"
    done
}

# 由「全限定类名」推出源文件路径（顺带处理嵌套类 Foo$Bar、lambda$xxx 这类字节码名）。
source_file_for() {
    local fqcn="$1" rel
    fqcn="${fqcn%%\$*}"
    rel="src/main/java/$(printf '%s' "${fqcn}" | tr '.' '/').java"
    if [[ -f "${ROOT_DIR}/${rel}" ]]; then printf '%s' "${rel}"; fi
}

# ── 跑验收 ───────────────────────────────────────────────────
set +e
./gradlew --console=plain build ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"} > "${LOG}" 2>&1
status=$?
set -e

if [[ ${status} -eq 0 ]]; then
    test_classes="$(find build/test-results/test -name 'TEST-*.xml' 2>/dev/null | wc -l | tr -d ' ')"
    test_cases="$(grep -ho 'tests="[0-9]*"' build/test-results/test/TEST-*.xml 2>/dev/null |
        cut -d'"' -f2 | awk '{ s += $1 } END { printf "%d", s }')"
    line_ratio="$(bundle_ratio LINE)"
    branch_ratio="$(bundle_ratio BRANCH)"
    top_crap="$(awk 'NR == 5 { print $1 }' "${CRAP_TXT}" 2>/dev/null)"
    echo "✓ QA 门禁通过"
    echo "  · 测试：${test_classes} 个类 / ${test_cases} 个用例（离线部分；集成测试用 scripts/dev-it.sh）"
    echo "  · 覆盖率：行 ${line_ratio:-n/a}%（下限 ${COVERAGE_LINE_MIN}）、分支 ${branch_ratio:-n/a}%（下限 ${COVERAGE_BRANCH_MIN}）"
    echo "  · CRAP：最高 ${top_crap:-n/a}（上限 ${CRAP_MAX}）"
    echo "  · 格式与架构守护：通过"
    echo "  · 报告：build/reports/jacoco/test/html/index.html、build/reports/crap/crap.txt"
    exit 0
fi

# ── 失败：逐类给出可定位的证据 ───────────────────────────────
matched=0

echo
echo "✗ QA 门禁未通过（./gradlew build 退出码 ${status}）"
echo "  构建日志：build/qa-gate.log"

echo
echo "▸ 失败的 Gradle 任务"
grep -E '^> Task .* FAILED' "${LOG}" | sed 's/^/  /' || true

# 1) 编译错误：后面所有判定都基于旧产物，先修它
if grep -qE ':compile[A-Za-z]*Java FAILED' "${LOG}"; then
    matched=1
    echo
    echo "▸ 编译错误（先修这个，否则测试与门禁判定都基于旧产物）"
    grep -E '\.java:[0-9]+: (错误|error)' "${LOG}" | sed 's/^[[:space:]]*//' | awk '!seen[$0]++' | head -10 | sed 's/^/  /'
fi

# 2) 测试失败（ArchitectureTest 的架构违规也走这条，它就是普通测试类）
if grep -qE '^> Task :test FAILED' "${LOG}"; then
    matched=1
    echo
    echo "▸ 失败的测试（类 → 用例与断言消息）"
    for result in build/test-results/test/TEST-*.xml; do
        [[ -f "${result}" ]] || continue
        grep -qE 'failures="[1-9]|errors="[1-9]' "${result}" || continue
        cls="$(basename "${result}")"
        cls="${cls#TEST-}"
        cls="${cls%.xml}"
        echo "  · ${cls}"
        awk '
            /<testcase / {
                name = "";
                if (match($0, / name="[^"]*"/)) name = substr($0, RSTART + 7, RLENGTH - 8);
                pending = 1;
                next;
            }
            /<(failure|error) / {
                if (pending) {
                    msg = "";
                    if (match($0, /message="[^"]*"/)) msg = substr($0, RSTART + 9, RLENGTH - 10);
                    gsub(/&lt;/, "<", msg); gsub(/&gt;/, ">", msg);
                    gsub(/&quot;/, "\"", msg); gsub(/&apos;/, "\047", msg); gsub(/&amp;/, "\\&", msg);
                    if (length(msg) > 200) msg = substr(msg, 1, 200) "…";
                    failed++;
                    if (failed <= 5) printf "      %s\n        %s\n", name, msg;
                    pending = 0;
                }
                next;
            }
            { pending = 0 }
            END { if (failed > 5) printf "      …还有 %d 个用例失败（完整见 build/qa-gate.log）\n", failed - 5 }
        ' "${result}"
        echo "      重跑：./gradlew test --tests '${cls}'"
        case "${cls}" in
            *.ArchitectureTest)
                echo "      ↑ 架构守护失败：对照 docs/scaffold/structure.md 的「分层与依赖规则」改被测代码"
                ;;
        esac
    done
    echo "  ⚠️ 测试失败时覆盖率与 CRAP 的数字不可靠（采集数据不完整），先修测试再重跑本脚本。"
fi

# 3) Spotless 格式违规
if grep -q 'had format violations' "${LOG}"; then
    matched=1
    echo
    echo "▸ Spotless 格式违规的文件"
    awk '/had format violations/ { inblock = 1; next }
         inblock && /^ {6}[^ ]/ { print }
         inblock && /^ {2}[^ ]/ { inblock = 0 }' "${LOG}" | sed 's/^ */  · /'
    echo "  修法：./gradlew spotlessApply（只改写相对 HEAD 有改动的文件）"
fi

# 4) 覆盖率低于下限
if grep -q 'Rule violated for bundle' "${LOG}"; then
    matched=1
    echo
    echo "▸ 覆盖率低于下限（gradle.properties：coverageLineMin=${COVERAGE_LINE_MIN}、coverageBranchMin=${COVERAGE_BRANCH_MIN}）"
    grep -oE 'Rule violated for bundle [^ ]+: [a-z]+ covered ratio is [0-9.]+, but expected minimum is [0-9.]+' "${LOG}" |
        awk '!seen[$0]++' | sed 's/^/  /'
    echo "  · 未覆盖行最多的类（行覆盖最差在前）"
    worst_covered_classes
    echo "  ↳ 只由集成测试覆盖的类（infrastructure/persistence 等）在默认运行里就是 0%，属预期；"
    echo "     要合并两层覆盖率：scripts/dev-it.sh build（见 docs/scaffold/development.md）"
    echo "  · 报告：build/reports/jacoco/test/html/index.html"
fi

# 5) CRAP 超过上限。注意：若覆盖率门禁先失败，crapCheck 不会执行、报告可能不存在，
#    这里补跑一次「只出报告不判定」的 crapReport，保证引导信息可用。
if ! grep -qE '^> Task :test FAILED' "${LOG}"; then
    if [[ ! -f "${CRAP_TXT}" ]]; then
        ./gradlew --console=plain crapReport ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"} >> "${LOG}" 2>&1 || true
    fi
fi

if [[ -f "${CRAP_TXT}" ]]; then
    offenders="$(awk -v max="${CRAP_MAX}" 'NR > 4 && $1 + 0 > max {
        m = "";
        for (i = 4; i <= NF; i++) m = m (i > 4 ? " " : "") $i;
        printf "%s %s %s %s\n", $1, $2, $3, m;
    }' "${CRAP_TXT}")"
    if [[ -n "${offenders}" ]]; then
        matched=1
        echo
        echo "▸ CRAP 超过上限（crapMax=${CRAP_MAX}）：圈复杂度高又缺测试"
        while read -r crap complexity coverage method; do
            [[ -n "${method}" ]] || continue
            printf '  · CRAP %s（复杂度 %s、行覆盖 %s）%s\n' "${crap}" "${complexity}" "${coverage}" "${method}"
            src="$(source_file_for "${method%.*}")"
            if [[ -n "${src}" ]]; then printf '      源码：%s\n' "${src}"; fi
        done <<< "${offenders}"
        echo "  修法：补单元测试、或拆小方法（拆复杂度比堆测试更有效）"
    fi
fi

# 6) 兜底：没归类出来就把日志尾部贴出来，别让人只看到「失败」两个字
if [[ ${matched} -eq 0 ]]; then
    echo
    echo "▸ 未能归类失败原因，附日志尾部（完整日志：build/qa-gate.log）"
    tail -n 25 "${LOG}" | sed 's/^/  /'
fi

cat <<'TXT'

───────────────────────────────────────────────
下一步（改被测代码，不要改测试或门禁本身）：
  · 修完重跑：scripts/qa-gate.sh
  · 只看 CRAP 分数：./gradlew crapReport
  · 变异测试（可选，慢）：scripts/mutation-gate.sh（默认只变异变更类；详见 docs/scaffold/development.md）
  · 只看覆盖率：./gradlew jacocoTestReport（报告在 build/reports/jacoco/test/html/index.html）
  · 只重跑某个测试类：./gradlew test --tests 'com.acme.app.SomeTest'
  · 改动涉及仓储 / 迁移脚本 / 缓存等只有真实库能验证的东西：scripts/dev-it.sh（本脚本不含集成测试）
  · 完整日志：build/qa-gate.log

禁止为了让门禁变绿而修改测试套件（测试代码、测试资源、断言、测试 profile、excludeTags）、
门禁阈值（gradle.properties 的 coverageLineMin / coverageBranchMin / crapMax）或加排除规则，
也不要用 -x / --rerun-tasks 之类绕过。门禁失败时的正确修法是：改被测代码，或补测试。
TXT

exit "${status}"
