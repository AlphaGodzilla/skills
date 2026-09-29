#!/usr/bin/env node
/**
 * antd 用法门禁：把 `antd lint` 包成「有违规就非 0 退出」。
 *
 * 为什么必须包一层：`npx antd lint` 即使发现 deprecated / a11y / usage / performance 问题
 * **也返回 0**（实测），直接当门禁用会永远通过；它默认还只打印文本，不产出可解析的报告。
 * 本脚本改用 `--format json` 取结构化结果，落盘报告，并按 `summary.total` 判定。
 *
 * 用法：
 *     node scripts/antd-lint-gate.mjs [--dir src] [--report reports/qa-gate/antd-lint.json]
 * 退出码：0 通过，1 有违规或输出无法解析，2 CLI 未安装。
 *
 * 用法与排查方式见 .pi/skills/antd/SKILL.md（自带技能）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = resolve(ROOT, 'node_modules/.bin/antd');

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined
    ? argv[index + 1]
    : fallback;
};

const target = option('--dir', 'src');
const reportPath = resolve(
  ROOT,
  option('--report', 'reports/qa-gate/antd-lint.json'),
);
const MAX_PRINTED = 10;

if (!existsSync(CLI)) {
  console.error(
    '✗ 找不到 antd CLI（node_modules/.bin/antd）。先执行：npm install',
  );
  process.exit(2);
}

const result = spawnSync(CLI, ['lint', target, '--format', 'json'], {
  cwd: ROOT,
  encoding: 'utf8',
});

// stdout 里可能混有 CLI 的提示文字，从第一个 `{` 起截取再解析
const raw = result.stdout ?? '';
const start = raw.indexOf('{');
if (start < 0) {
  console.error('✗ antd lint 没有输出 JSON，无法判定（CLI 行为变化？）');
  console.error(`  stdout: ${raw.trim().slice(0, 400)}`);
  console.error(`  stderr: ${(result.stderr ?? '').trim().slice(0, 400)}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw.slice(start));
} catch (error) {
  console.error(`✗ antd lint 的 JSON 输出无法解析：${error.message}`);
  console.error(`  原始输出：${raw.trim().slice(0, 400)}`);
  process.exit(1);
}

const issues = report.issues ?? [];
const summary = report.summary ?? { total: issues.length };
const skipped = report.skippedFiles ?? [];

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`▸ antd 用法检查（${target}）：${summary.total} 处问题`);

for (const issue of issues.slice(0, MAX_PRINTED)) {
  const file = String(issue.file ?? '').replace(`${ROOT}/`, '');
  console.log(
    `    ${file}:${issue.line ?? 0} [${issue.rule}] ${issue.message}`,
  );
}
if (issues.length > MAX_PRINTED) {
  console.log(
    `    …还有 ${issues.length - MAX_PRINTED} 处（完整见 ${reportPath.slice(ROOT.length + 1)}）`,
  );
}

if (skipped.length > 0) {
  // 语法坏掉的文件由 tsc / biome 负责报错，这里只提示，避免双重报错掩盖真正的第一现场
  console.log(
    `  · 跳过 ${skipped.length} 个无法解析的文件（语法问题由类型检查与 Biome 报告）`,
  );
}

if (summary.total === 0) {
  console.log(
    '✓ antd 用法检查通过（无 deprecated / a11y / usage / performance 问题）',
  );
  process.exit(0);
}

console.log('');
console.log('✗ antd 用法检查未通过。修法：');
console.log(
  '  · 先查当前版本的 API：npx antd info <Component> --format json（见 .pi/skills/antd/SKILL.md）',
);
console.log(
  '  · 需要明细与迁移清单：npx antd lint ./src --format json --only deprecated、npx antd migrate <旧> <新>',
);
console.log('  · 常见例子：antd 6 里 Alert 的 message 已改名 title');
console.log(`  · 报告：${reportPath.slice(ROOT.length + 1)}`);
process.exit(1);
