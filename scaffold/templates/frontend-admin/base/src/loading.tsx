import { Skeleton } from 'antd';

/**
 * 路由级懒加载占位（umi 约定文件）。
 *
 * 与 `public/scripts/loading.js` 分工不同：这个组件负责**切换路由之后**的等待，
 * 那个脚本负责**首屏 HTML 到 React 接管之前**的等待。
 */
const Loading: React.FC = () => (
  <Skeleton style={{ padding: '24px 40px', height: '60vh' }} active />
);

export default Loading;
