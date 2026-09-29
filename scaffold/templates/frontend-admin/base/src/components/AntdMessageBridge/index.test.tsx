import { render } from '@testing-library/react';
import { App } from 'antd';
import React from 'react';
import { describe, expect, it } from 'vitest';

import AntdMessageBridge, { getAppMessage } from './index';

describe('AntdMessageBridge', () => {
  it('挂载后把 <App> 的 message 实例交给非组件代码，卸载后收回', () => {
    expect(getAppMessage()).toBeUndefined();

    const { unmount } = render(
      <App>
        <AntdMessageBridge />
      </App>,
    );

    // 非组件代码（requestErrorConfig 的全局错误处理）拿到的必须是上下文实例，
    // 静态 message.error 拿不到主题与语言。
    expect(typeof getAppMessage()?.error).toBe('function');

    unmount();
    expect(getAppMessage()).toBeUndefined();
  });
});
