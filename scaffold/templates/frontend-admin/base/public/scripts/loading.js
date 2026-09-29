/**
 * 首屏占位：解决首次加载时的白屏。
 *
 * 由 config/config.ts 的 headScripts 引入（构建时进 HTML，不属于打包产物）；
 * #root 一旦有内容就让位给 React，因此对已渲染的页面无副作用。
 */
(() => {
  const root = document.querySelector('#root');
  if (!root || root.innerHTML !== '') {
    return;
  }
  root.innerHTML = [
    '<style>',
    'html, body, #root { height: 100%; margin: 0; padding: 0; }',
    '.boot-placeholder {',
    '  display: flex; align-items: center; justify-content: center; height: 100%;',
    '  font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;',
    '  color: #8c8c8c;',
    '}',
    '</style>',
    '<div class="boot-placeholder">正在加载…</div>',
  ].join('');
})();
