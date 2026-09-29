import type { ProLayoutProps } from '@ant-design/pro-components';

/**
 * ProLayout 的默认外观。
 *
 * 这里是**整个壳层的默认值**（主题、布局、标题、主色），运行时由 `src/app.tsx` 的
 * `getInitialState()` 交给 ProLayout；需要按环境或按用户切换时，改 `getInitialState` 的返回值即可。
 */
const Settings: ProLayoutProps = {
  navTheme: 'light',
  colorPrimary: '#1677ff',
  layout: 'mix',
  contentWidth: 'Fluid',
  fixedHeader: false,
  fixSiderbar: true,
  colorWeak: false,
  title: 'Order Admin',
  iconfontUrl: '',
  // 暂无自有 logo：显式置 false，避免落到 ProLayout 注入的上游 Ant Design 图标
  logo: false,
  token: {
    // 参见 ts 声明，demo 见文档，通过 token 修改样式
    // https://procomponents.ant.design/components/layout#%E9%80%9A%E8%BF%87-token-%E4%BF%AE%E6%94%B9%E6%A0%B7%E5%BC%8F
  },
};

export default Settings;
