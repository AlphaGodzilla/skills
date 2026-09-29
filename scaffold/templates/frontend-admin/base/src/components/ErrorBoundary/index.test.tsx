import { render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 记录用到的 i18n key：线上/线下文案在 mock 下是同一份 defaultMessage，
// 只有 key 不同，所以必须断言 key 而不是文案。
const intlKeys = vi.hoisted(() => ({ used: [] as string[] }));

vi.mock('@umijs/max', () => ({
  getIntl: () => ({
    formatMessage: ({
      id,
      defaultMessage,
    }: {
      id?: string;
      defaultMessage?: string;
    }) => {
      if (id) {
        intlKeys.used.push(id);
      }
      return defaultMessage;
    },
  }),
}));

import ErrorBoundary from './index';

/** 崩溃开关：先正常挂载，再通过 rerender 让它抛错，用于验证事件驱动的状态变化。 */
const MaybeBoom = ({ error }: { error?: Error }): ReactNode => {
  if (error) {
    throw error;
  }
  return <div>正常内容</div>;
};

const renderBoundary = (error?: Error) =>
  render(
    <ErrorBoundary>
      <MaybeBoom error={error} />
    </ErrorBoundary>,
  );

const chunkError = (message = 'loading chunk 3 failed') => new Error(message);

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
};

const dispatch = (event: 'online' | 'offline') =>
  React.act(() => {
    window.dispatchEvent(new Event(event));
  });

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React 会把捕获到的异常打给 console.error；测试里静音，避免污染输出
    vi.spyOn(console, 'error').mockImplementation(() => {});
    intlKeys.used.length = 0;
    setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('没有异常时原样渲染子树', () => {
    renderBoundary();

    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('渲染异常时给兜底页而不是白屏，并把异常交给控制台', () => {
    renderBoundary(new Error('组件里抛了个错'));

    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.any(Error),
      expect.anything(),
    );
  });

  it('普通渲染错误：用「渲染异常」的 key，且不给「重试」', () => {
    renderBoundary(new Error('数据格式不对'));

    expect(intlKeys.used).toContain('app.error.render.title');
    expect(intlKeys.used).toContain('app.error.render.description');
    expect(screen.queryByRole('button', { name: /重\s*试/ })).toBeNull();
    expect(screen.getByText('刷新页面')).toBeInTheDocument();
  });

  it('按错误名识别 chunk 失效（消息里没有 chunk 字样也要认出来）', () => {
    const error = chunkError('莫名其妙的加载失败');
    error.name = 'ChunkLoadError';

    renderBoundary(error);

    expect(intlKeys.used).toContain('app.error.chunk.title');
    // antd 会在两个汉字的按钮文字间插空格，因此按可访问名匹配而不是精确文本
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument();
  });

  it('按错误消息识别 chunk 失效（动态 import 失败）', () => {
    renderBoundary(chunkError('Failed to fetch dynamically imported module'));

    expect(intlKeys.used).toContain('app.error.chunk.title');
  });

  it('css chunk 加载失败同样算 chunk 失效', () => {
    renderBoundary(chunkError('loading css chunk 5 failed'));

    expect(intlKeys.used).toContain('app.error.chunk.title');
  });

  it('在线时用「在线」文案（发版后旧页面最常见）', () => {
    renderBoundary(chunkError());

    expect(intlKeys.used).toContain('app.error.chunk.description.online');
    expect(intlKeys.used).not.toContain('app.error.chunk.description.offline');
  });

  it('挂载后断网再崩掉：offline 事件生效，提示指向网络', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );

    dispatch('offline');
    rerender(
      <ErrorBoundary>
        <MaybeBoom error={chunkError()} />
      </ErrorBoundary>,
    );

    expect(intlKeys.used).toContain('app.error.chunk.description.offline');
  });

  it('断网时崩掉、随后网络恢复：online 事件生效，提示换回在线文案', () => {
    setOnline(false);
    const { rerender, unmount } = render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );
    dispatch('offline');
    rerender(
      <ErrorBoundary>
        <MaybeBoom error={chunkError()} />
      </ErrorBoundary>,
    );
    expect(intlKeys.used).toContain('app.error.chunk.description.offline');

    intlKeys.used.length = 0;
    setOnline(true);
    dispatch('online');

    expect(intlKeys.used).toContain('app.error.chunk.description.online');
    unmount();
  });

  it('点「重试」会重新挂载子树（旧 chunk 的唯一自愈路径）', () => {
    renderBoundary(chunkError('loading chunk 7 failed'));
    expect(screen.getByText('页面资源加载失败')).toBeInTheDocument();

    React.act(() => {
      screen.getByRole('button', { name: /重\s*试/ }).click();
    });

    // 子树仍然抛错，于是又落回兜底页：说明「重试」确实把子树卸载重挂了
    expect(screen.getByText('页面资源加载失败')).toBeInTheDocument();
  });
});
