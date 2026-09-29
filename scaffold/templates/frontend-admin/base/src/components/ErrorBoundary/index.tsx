import { getIntl } from '@umijs/max';
import { Button, Card, Result } from 'antd';
import React from 'react';

/**
 * 判断是不是「部署后旧 chunk 失效」类错误。
 *
 * 这类错误在管理后台最常见：发版后旧页面还开着，点菜单去加载已被替换的 chunk 就会失败。
 * 它与代码 bug 的处理方式不同——重试下载即可恢复，所以单独识别。
 */
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /(?:loading|failed to load) (?:css )?chunk/i.test(error.message) ||
    /Failed to fetch dynamically imported module/i.test(error.message)
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isOnline: boolean;
  retryCount: number;
}

/**
 * 渲染期异常兜底：包住全部路由（见 `src/app.tsx` 的 rootContainer），
 * 单个页面崩掉不会白屏，也给 chunk 失效提供「重试」路径。
 */
export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    // 这是纯浏览器应用（无 SSR），直接用 navigator：留着 typeof 兜底只会多出无法被测试覆盖的死分支
    isOnline: navigator.onLine,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  handleOnline = () => {
    this.setState({ isOnline: true });
  };

  handleOffline = () => {
    this.setState({ isOnline: false });
  };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    // 改变子树的 key 会强制卸载并重新挂载，懒加载组件因此重新执行 import()，
    // 拿到新的 chunk 文件名——这是「发版后旧 chunk 404」的唯一自愈路径。
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, isOnline, retryCount } = this.state;
    if (!hasError || !error) {
      return (
        <React.Fragment key={retryCount}>{this.props.children}</React.Fragment>
      );
    }

    const intl = getIntl();
    const isChunkError = isChunkLoadError(error);
    const isOffline = !isOnline;

    let subTitleId = 'app.error.render.description';
    if (isChunkError) {
      subTitleId = isOffline
        ? 'app.error.chunk.description.offline'
        : 'app.error.chunk.description.online';
    }

    return (
      <Card variant="borderless" style={{ margin: 24 }}>
        <Result
          status="error"
          title={intl.formatMessage({
            id: isChunkError
              ? 'app.error.chunk.title'
              : 'app.error.render.title',
            defaultMessage: isChunkError ? '页面资源加载失败' : '页面出错了',
          })}
          subTitle={intl.formatMessage({
            id: subTitleId,
            defaultMessage: isChunkError
              ? '页面资源没有加载成功，重试或刷新后即可恢复。'
              : '这个页面渲染时发生异常，可以刷新重试或回到首页。',
          })}
          extra={[
            isChunkError && (
              <Button type="primary" key="retry" onClick={this.handleRetry}>
                {intl.formatMessage({
                  id: 'app.error.retry',
                  defaultMessage: '重试',
                })}
              </Button>
            ),
            <Button
              type={isChunkError ? 'default' : 'primary'}
              key="reload"
              onClick={this.handleReload}
            >
              {intl.formatMessage({
                id: 'app.error.reload',
                defaultMessage: '刷新页面',
              })}
            </Button>,
            <Button href="/" key="home">
              {intl.formatMessage({
                id: 'app.error.home',
                defaultMessage: '返回首页',
              })}
            </Button>,
          ].filter(Boolean)}
        />
      </Card>
    );
  }
}
