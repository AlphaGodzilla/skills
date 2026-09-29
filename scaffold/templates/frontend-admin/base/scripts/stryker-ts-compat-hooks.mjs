/** 解析钩子：StrykerJS 内部 `import('typescript')` 时，改指到带 JS 编译器 API 的经典内核。 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'typescript') {
    return nextResolve('typescript-classic', context);
  }
  return nextResolve(specifier, context);
}
