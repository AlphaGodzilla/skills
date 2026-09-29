// https://umijs.org/config/

import { defineConfig } from '@umijs/max';
import defaultSettings from './defaultSettings';
import proxy from './proxy';

import routes from './routes';

const { UMI_ENV = 'dev' } = process.env;

/**
 * @name 公共路径
 * @description 部署时的路径，前后端同源部署在根路径下，保持 '/'
 * @doc https://umijs.org/docs/api/config#publicpath
 */
const PUBLIC_PATH: string = '/';

export default defineConfig({
  /**
   * @name 开启 hash 模式
   * @description 让 build 之后的产物包含 hash 后缀。通常用于增量发布和避免浏览器加载缓存。
   * @doc https://umijs.org/docs/api/config#hash
   */
  hash: true,

  publicPath: PUBLIC_PATH,

  /**
   * @name 路由的配置，不在路由中引入的文件不会编译
   * @doc https://umijs.org/docs/guides/routes
   */
  routes,
  /**
   * @name moment 的国际化配置
   * @description 时间库统一用 dayjs（moment2dayjs 插件），不打包 moment 的语言包
   * @doc https://umijs.org/docs/api/config#ignoremomentlocale
   */
  ignoreMomentLocale: true,
  /**
   * @name 代理配置
   * @description 只在本地的 dev server 生效（npm start / npm run dev），生产环境前后端同源，不需要代理。
   * @doc https://umijs.org/docs/guides/proxy
   */
  proxy: proxy[UMI_ENV as keyof typeof proxy],
  /**
   * @name 快速热更新配置
   */
  fastRefresh: true,
  /**
   * @name 路由预加载
   * @doc https://umijs.org/docs/api/config#routePrefetch
   */
  routePrefetch: {},
  //============== 以下都是 max 的插件配置 ===============
  /**
   * @name 数据流插件
   * @doc https://umijs.org/docs/max/data-flow
   */
  model: {},
  /**
   * @name 全局初始状态
   * @doc https://umijs.org/docs/max/data-flow
   */
  initialState: {},
  /**
   * @name layout 插件
   * @doc https://umijs.org/docs/max/layout-menu
   */
  title: '{{title}}',
  layout: {
    locale: true,
    ...defaultSettings,
  },
  /**
   * @name moment2dayjs 插件
   * @doc https://umijs.org/docs/max/moment2dayjs
   */
  moment2dayjs: {
    preset: 'antd',
    plugins: ['duration', 'relativeTime'],
  },
  /**
   * @name 国际化插件
   * @doc https://umijs.org/docs/max/i18n
   */
  locale: {
    // default zh-CN
    default: 'zh-CN',
    antd: true,
    // default true, when it is true, will use `navigator.language` overwrite default
    baseNavigator: true,
  },
  /**
   * @name antd 插件
   * @doc https://umijs.org/docs/max/antd#antd
   */
  antd: {
    appConfig: {},
  },
  /**
   * @name 网络请求配置
   * @description 运行时配置见 src/app.tsx 的 request 导出
   * @doc https://umijs.org/docs/max/request
   */
  request: {},
  /**
   * @name <head> 中额外的 script
   */
  headScripts: [
    // 解决首次加载时白屏的问题
    { src: `${PUBLIC_PATH}scripts/loading.js`, async: true },
  ],
  tailwindcss: {},
  /**
   * @name 构建器（v6 主线为 utoopack，Turbopack 内核）
   * @doc https://utoo.land
   */
  utoopack: {},
  exportStatic: {},
});
