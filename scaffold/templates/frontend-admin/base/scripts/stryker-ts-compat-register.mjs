/**
 * 通过 `node --import ./scripts/stryker-ts-compat-register.mjs` 引入本文件，
 * 为 **StrykerJS 进程**注册 typescript 解析钩子（见 ./stryker-ts-compat-hooks.mjs）。
 *
 * 为什么需要它：项目用的是 typescript 7（tsgo，只提供原生 API，已移除 JS 编译器 API），
 * 而 StrykerJS 的 sandbox 预处理要调用 `ts.parseConfigFileTextToJson`。钩子只在本进程内
 * 把 `typescript` 解析到 `typescript-classic`（= 官方过渡兼容包 @typescript/typescript6），
 * 项目自身的 `tsc` 与 vitest 仍然用 TS 7。详见 docs/scaffold/development.md 的变异测试一节。
 */
import { register } from 'node:module';

register('./stryker-ts-compat-hooks.mjs', import.meta.url);
