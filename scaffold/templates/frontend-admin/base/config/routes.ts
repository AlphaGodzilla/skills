/**
 * @name umi 的路由配置
 * @description 支持 path / component / routes / redirect / wrappers / name / icon 等字段。
 *   `name` 是 i18n 的 key（`menu.<name>`），因此每个出现的 name 都要在
 *   `src/locales/<语言>/menu.ts` 里有对应文案，否则菜单会显示原始 key。
 * @doc https://umijs.org/docs/guides/routes
 */
export default [
  {
    path: '/',
    name: 'home',
    icon: 'home',
    component: './Welcome',
  },
  {
    // 分层样例：列表页。真实业务按同样形状建自己的模块目录，然后删掉 sample
    path: '/samples',
    name: 'sample-list',
    icon: 'table',
    component: './sample/list',
  },
  {
    // 路径含 :id，菜单无法生成可点击链接；入口是列表页的行点击
    path: '/samples/:id',
    name: 'sample-detail',
    hideInMenu: true,
    component: './sample/detail',
  },
  {
    // 兜底：未匹配的路径渲染 404，且不套 ProLayout
    path: '*',
    layout: false,
    component: './exception/404',
  },
];
