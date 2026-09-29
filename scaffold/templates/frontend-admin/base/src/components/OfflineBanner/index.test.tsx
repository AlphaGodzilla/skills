import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@umijs/max', () => ({
  getIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage?: string }) =>
      defaultMessage,
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
