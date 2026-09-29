import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { Link } from '@umijs/max';
import { App } from 'antd';
import React from 'react';

import { AntdMessageBridge, ErrorBoundary, OfflineBanner } from '@/components';
import defaultSettings from '../config/defaultSettings';
import { errorConfig } from './requestErrorConfig';

/**
 * @see https://umijs.org/docs/api/runtime-config#getinitialstate
 * 初始状态目前只承载布局设置。接入登录后在这里拉当前用户，并交给 `src/access.ts` 判权限。
 */
export async function getInitialState(): Promise<{
  settings?: typeof defaultSettings;
}> {
  return {
    settings: defaultSettings,
  };
}

// ProLayout 支持的 api https://procomponents.ant.design/components/layout
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    menuItemRender: (item, dom) => {
      if (item.path) {
        return (
          <Link to={item.path} prefetch>
            {dom}
          </Link>
        );
      }
      return dom;
    },
    ...initialState?.settings,
  };
};

/**
 * @name request 配置
 * @description baseURL 留空 = 与后端同源（开发期由 config/proxy.ts 转发到 API_TARGET）；
 *   错误处理统一走 src/requestErrorConfig.ts 的 RFC 7807 解析。
 * @doc https://umijs.org/docs/max/request#配置
 */
export const request: RequestConfig = {
  baseURL: '',
  ...errorConfig,
};

export function rootContainer(container: React.ReactNode) {
  return (
    <App>
      {/*
        这一层 <App> 与全局兜底必须挂在这里：`layout: false` 的路由（如 404 页）不经过 ProLayout，
        没有它就拿不到 antd 的上下文实例（message/notification/modal），也拿不到 ErrorBoundary 兜底。
      */}
      <AntdMessageBridge />
      <OfflineBanner />
      <ErrorBoundary>{container}</ErrorBoundary>
    </App>
  );
}
