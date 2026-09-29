#!/usr/bin/env node
/**
 * CRAP 门禁：把「复杂度」和「覆盖率」合成一个风险分（Alberto Savoia 的 CRAP 指标）。
 *
 *     CRAP = 复杂度² × (1 − 覆盖率)³ + 复杂度
 *
 * 它补的是纯覆盖率看不到的那一半：一段代码即使被跑过，只要又复杂又没断言，
 * 风险依然是高的。阈值与覆盖率阈值一起放在 gate.config.json。
 *
 * 数据来源只有 `coverage/coverage-final.json`（istanbul 格式，vitest 的 v8 provider 产出）：
 *   - `fnMap`    函数名与行范围
 *   - `branchMap` 分支点，用来估算圈复杂度
 *   - `statementMap` / `s` 函数范围内的语句覆盖
 *
 * 刻意**不依赖 TypeScript 的编译器 API**：项目用的是 TS 7（tsgo），那套 JS API 已被移除。
 * 代价：嵌套函数范围内的分支会被外层函数一起计入，因此复杂度是上界估计（偏保守）。
 *
 * 用法：
 *     node scripts/crap-report.mjs [--max 30] [--top 10] [--report reports/crap/crap.txt]
 * 退出码：0 通过，1 有方法超过上限，2 缺覆盖率数据。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'src');
const COVERAGE_FILE = resolve(ROOT, 'coverage/coverage-final.json');
const GATE_FILE = resolve(ROOT, 'gate.config.json');

const argv = process.argv.slice(2);

function option(name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined
    ? argv[index + 1]
    : fallback;
}

const gate = JSON.parse(readFileSync(GATE_FILE, 'utf8'));
const maxCrap = Number(option('--max', gate.crap.max));
const topCount = Number(option('--top', gate.crap.top));
const reportPath = resolve(ROOT, option('--report', 'reports/crap/crap.txt'));

if (!existsSync(COVERAGE_FILE)) {
  console.error(`✗ 缺少覆盖率数据：${COVERAGE_FILE}`);
  console.error('  先跑一次带覆盖率的测试：npm run test:coverage');
  process.exit(2);
}

/** 只统计业务源码：测试文件、类型声明与 umi 生成代码都不参与。 */
function isBusinessSource(absolutePath) {
  if (!absolutePath.startsWith(SRC)) {
    return false;
  }
  const relativePath = absolutePath.slice(SRC.length).split('\\').join('/');
  if (relativePath.includes('/.umi')) {
    return false;
  }
  if (/\.(test|spec)\.[jt]sx?$/.test(relativePath)) {
    return false;
  }
  return !relativePath.endsWith('.d.ts');
}

/**
 * 估复杂度：函数行范围内的分支点个数 + 1。
 * 圈复杂度的标准定义（判定点 + 1）在 JS 里落到 istanbul 的 branchMap 上，
 * 覆盖 if / 三元 / && / || / ?? / switch / catch / 默认参数等。
 */
function complexityOf(entry, functionRange) {
  let branches = 0;
  for (const branch of Object.values(entry.branchMap ?? {})) {
    const line = branch.loc?.start?.line;
    if (line === undefined) {
      continue;
    }
    if (line >= functionRange.start && line <= functionRange.end) {
      branches += 1;
    }
  }
  return branches + 1;
}

/** 函数范围内的语句覆盖率；范围内没有语句时退回「函数是否被调用过」。 */
function coverageOf(entry, functionRange, functionId) {
  let total = 0;
  let covered = 0;
  for (const [id, statement] of Object.entries(entry.statementMap ?? {})) {
    const line = statement.start?.line;
    if (line === undefined) {
      continue;
    }
    if (line < functionRange.start || line > functionRange.end) {
      continue;
    }
    total += 1;
    if ((entry.s?.[id] ?? 0) > 0) {
      covered += 1;
    }
  }
  if (total === 0) {
    return (entry.f?.[functionId] ?? 0) > 0 ? 1 : 0;
  }
  return covered / total;
}

const coverage = JSON.parse(readFileSync(COVERAGE_FILE, 'utf8'));
const scores = [];

for (const [file, entry] of Object.entries(coverage)) {
  if (!isBusinessSource(file)) {
    continue;
  }
  for (const [id, fn] of Object.entries(entry.fnMap ?? {})) {
    const range = { start: fn.loc?.start?.line, end: fn.loc?.end?.line };
    if (range.start === undefined || range.end === undefined) {
      continue;
    }
    const complexity = complexityOf(entry, range);
    const coverageRatio = coverageOf(entry, range, id);
    const crap = complexity ** 2 * (1 - coverageRatio) ** 3 + complexity;

    scores.push({
      file: file.slice(ROOT.length + 1),
      line: fn.line ?? range.start,
      name: fn.name ?? '(anonymous)',
      complexity,
      coverage: coverageRatio,
      crap,
    });
  }
}

scores.sort((left, right) => right.crap - left.crap);
const overLimit = scores.filter((score) => score.crap > maxCrap);

const lines = [];
lines.push(
  `CRAP 门禁（上限 crapMax=${maxCrap}，共统计 ${scores.length} 个函数）`,
);
lines.push('');
lines.push('分数最高的若干个函数（复杂度 × 覆盖率 的风险排序）：');
for (const score of scores.slice(0, topCount)) {
  const flag = score.crap > maxCrap ? '✗ 超限' : '  ok';
  lines.push(
    `${flag}  CRAP=${score.crap.toFixed(1).padStart(6)}  复杂度=${String(score.complexity).padStart(2)}  覆盖=${(score.coverage * 100).toFixed(0).padStart(3)}%  ${score.file}:${score.line} ${score.name}`,
  );
}
lines.push('');
if (overLimit.length === 0) {
  lines.push(`✓ 没有函数超过 crapMax=${maxCrap}`);
} else {
  lines.push(`✗ ${overLimit.length} 个函数超过 crapMax=${maxCrap}：`);
  for (const score of overLimit) {
    lines.push(
      `  - CRAP=${score.crap.toFixed(1)} 复杂度=${score.complexity} 覆盖=${(score.coverage * 100).toFixed(0)}% ${score.file}:${score.line} ${score.name}`,
    );
  }
  lines.push('');
  lines.push('修法只有两种：把复杂的函数拆小，或给它的每个分支补测试。');
  lines.push('不要调高 gate.config.json 的 crap.max —— 那是把风险藏起来。');
}
lines.push('');

const output = lines.join('\n');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, output, 'utf8');
process.stdout.write(
  `${output}\n明细已写入 ${reportPath.slice(ROOT.length + 1)}\n`,
);

process.exit(overLimit.length === 0 ? 0 : 1);
