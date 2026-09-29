import { App } from 'antd';
import React, { useEffect } from 'react';

type MessageInstance = ReturnType<typeof App.useApp>['message'];

let messageInstance: MessageInstance | undefined;

/**
 * 供**非组件代码**使用的 message 实例（当前唯一消费方是 `requestErrorConfig` 的全局错误处理）。
 *
 * antd 的静态 `message.error` 拿不到 `ConfigProvider` 的动态主题与语言，控制台会告警，
 * 提示样式也会与站点主题不一致；因此必须改用 `<App>` 提供的上下文实例。
 */
export function getAppMessage(): MessageInstance | undefined {
  return messageInstance;
}

/**
 * message 上下文桥：把 `<App>` 内的 message 实例交给模块级变量。
 * 必须渲染在 antd `<App>` 之内（见 `src/app.tsx` 的 rootContainer）；自身不渲染任何 DOM。
 */
const AntdMessageBridge: React.FC = () => {
  const { message } = App.useApp();

  useEffect(() => {
    messageInstance = message;
    return () => {
      messageInstance = undefined;
    };
  }, [message]);

  return null;
};

export default AntdMessageBridge;
