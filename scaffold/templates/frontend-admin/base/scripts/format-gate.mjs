#!/usr/bin/env node
/**
 * 格式与静态检查门禁（ratchet）：只检查「相对基线有改动」的文件。
 *
 * 与后端底座的 Spotless `ratchetFrom HEAD` 同一个思路：不要求存量文件立刻合规，
 * 但**所有新改动必须合规**，于是技术债不会继续变大，也不需要大爆炸式的一次性格式化。
 *
 * 用法：
 *     node scripts/format-gate.mjs                 # 提交前用：只查改动文件
 *     node scripts/format-gate.mjs --all           # 全量检查（大扫除时用，会报出存量问题）
 *     node scripts/format-gate.mjs --base origin/main
 *
 * 退出码：0 通过（含「没有改动文件」），1 有违规，2 biome 未安装。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIOME = resolve(ROOT, 'node_modules/.bin/biome');

/** 交给 biome 的文件类型；其余（图片、lock 文件等）直接跳过。 */
const CHECKED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|graphql)$/;
/** 单次命令行长度有限，分批调用。 */
const BATCH_SIZE = 80;

const passthrough = process.argv.slice(2).filter((arg) => arg !== '--quiet');

if (!existsSync(BIOME)) {
  console.error(
    '✗ 找不到 biome（node_modules/.bin/biome）。先执行：npm install',
  );
  process.exit(2);
}

function listChangedFiles() {
  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, 'scripts/changed-files.mjs'), ...passthrough],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const files = listChangedFiles().filter((file) =>
  CHECKED_EXTENSIONS.test(file),
);

if (files.length === 0) {
  console.log('✓ 没有需要检查的改动文件（ratchet：只检查改动，跳过）');
  process.exit(0);
}

console.log(`▸ 格式与静态检查（ratchet）：${files.length} 个改动文件`);

let exitCode = 0;
for (let start = 0; start < files.length; start += BATCH_SIZE) {
  const batch = files.slice(start, start + BATCH_SIZE);
  // --no-errors-on-unmatched：改动文件可能整体落在 biome 的忽略清单里（如 tailwind.css），
  // 那种情况不该被当成违规。
  const result = spawnSync(
    BIOME,
    ['check', '--no-errors-on-unmatched', ...batch],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    exitCode = 1;
  }
}

if (exitCode === 0) {
  console.log('✓ 改动文件格式与静态检查通过');
} else {
  console.error('');
  console.error('✗ 有格式或静态检查违规');
  console.error(
    '  修法：npm run format（等价于 biome check --write，只改写改动文件）',
  );
}
process.exit(exitCode);
