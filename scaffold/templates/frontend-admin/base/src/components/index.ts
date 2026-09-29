/**
 * 组件目录：统一对外输出跨页面复用的组件。
 *
 * 只放**被两个以上页面用到**的组件；页面私有组件留在页面目录里（见 docs/scaffold/structure.md）。
 */
export { default as AntdMessageBridge } from './AntdMessageBridge';
export { default as ErrorBoundary } from './ErrorBoundary';
export { default as OfflineBanner } from './OfflineBanner';
