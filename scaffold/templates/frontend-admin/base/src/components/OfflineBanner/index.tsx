import { getIntl } from '@umijs/max';
import { Alert } from 'antd';
import { useSyncExternalStore } from 'react';

const subscribeOnlineStatus = (callback: () => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

const getOnlineStatus = () => navigator.onLine;

/**
 * 断网横幅：离线时挂在所有路由之上（见 `src/app.tsx` 的 rootContainer）。
 *
 * 请求失败时 `requestErrorConfig` 只提示「网络不可用」，到底是不是整机离线由这里说明，
 * 两处合起来才能把「后端挂了」和「本机断网」区分开。
 */
const OfflineBanner: React.FC = () => {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getOnlineStatus,
    () => true,
  );

  if (isOnline) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      closable={false}
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        maxWidth: 480,
      }}
      title={getIntl().formatMessage({
        id: 'app.network.offline',
        defaultMessage: '当前网络不可用，部分功能会受影响。',
      })}
    />
  );
};

export default OfflineBanner;
