import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@umijs/max', () => ({
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

import OfflineBanner from './index';

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
};

describe('OfflineBanner', () => {
  afterEach(() => {
    setOnline(true);
  });

  it('在线时不渲染任何东西', () => {
    setOnline(true);

    const { container } = render(<OfflineBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('离线时挂出横幅', () => {
    setOnline(false);

    render(<OfflineBanner />);

    expect(
      screen.getByText('当前网络不可用，部分功能会受影响。'),
    ).toBeInTheDocument();
  });

  it('在线状态变化后跟随更新（online 事件）', () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(
      screen.getByText('当前网络不可用，部分功能会受影响。'),
    ).toBeInTheDocument();

    setOnline(true);
    React.act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText('当前网络不可用，部分功能会受影响。')).toBeNull();
  });
});
