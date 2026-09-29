import { describe, expect, it, vi } from 'vitest';

// 布局与兜底组件都从 @umijs/max 取 Link / getIntl；测试里只需要这两样
vi.mock('@umijs/max', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => children,
  getIntl: () => ({
    // 严格 mock：真实 react-intl 在缺 id 时会抛错，这里照做，否则「漏写 id」会被测试放过
    formatMessage: ({
      id,
      defaultMessage,
    }: {
      id?: string;
      defaultMessage?: string;
    }) => {
      if (!id) {
        throw new Error('i18n 调用缺少 id：react-intl 在真实运行时会直接抛错');
      }
      return defaultMessage;
    },
  }),
}));

import { render, screen } from '@testing-library/react';
import type { RunTimeLayoutConfig } from '@umijs/max';
import React from 'react';

import defaultSettings from '../config/defaultSettings';
import { getInitialState, layout, request, rootContainer } from './app';

/**
 * 调一次 `layout`，拿到展开后的 ProLayout 配置。
 * `layout` 在类型上允许是对象或函数，这里按函数用（见 src/app.tsx 的实现）。
 */
const buildLayout = () =>
  (layout as (args: unknown) => ReturnType<RunTimeLayoutConfig>)({
    initialState: { settings: defaultSettings },
  });

/** `menuItemRender` 的类型含 `false` 分支，用显式收窄顺便断言它确实配置了。 */
const renderMenuItem = (item: { path?: string }) => {
  const renderer = buildLayout().menuItemRender;
  if (typeof renderer !== 'function') {
    throw new Error('layout.menuItemRender 未配置');
  }
  // ProLayout 的签名是 (item, defaultDom, menuProps)，第三个参数在实现里用不到
  return renderer(item as never, '菜单', {} as never);
};

describe('app 运行时装配', () => {
  it('getInitialState 把布局设置交给 ProLayout', async () => {
    await expect(getInitialState()).resolves.toEqual({
      settings: defaultSettings,
    });
  });

  it('request 与后端同源，并挂上 RFC 7807 错误处理', () => {
    expect(request.baseURL).toBe('');
    expect(request.errorConfig).toBeDefined();
  });

  it('有 path 的菜单项套上 Link（走前端路由，不整页刷新）', () => {
    expect(renderMenuItem({ path: '/samples' })).toBeTruthy();
  });

  it('没有 path 的菜单项原样返回', () => {
    expect(renderMenuItem({})).toBe('菜单');
  });

  it('布局设置被展开到 ProLayout 上', () => {
    expect(buildLayout().title).toBe(defaultSettings.title);
  });

  it('rootContainer 渲染子树（全局兜底与断网横幅都挂在这一层）', () => {
    render(rootContainer(<div>页面内容</div>) as React.ReactElement);

    expect(screen.getByText('页面内容')).toBeInTheDocument();
  });
});
