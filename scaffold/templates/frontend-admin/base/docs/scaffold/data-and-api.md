# 请求层、错误契约与 mock

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在要改请求、mock、错误提示或数据加载方式时读。

## 请求层约定

`src/services/<资源>.ts`：一个资源一个文件，**只做「路径 + 方法 + 参数」**，不做形状转换、不做业务判断。

```ts
export async function listSamples(params: ListSamplesParams = {}): Promise<SamplePage> {
  return request<SamplePage>('/api/samples', { method: 'GET', params });
}
```

- 路径前缀统一 `/api`，与 `config/proxy.ts` 的代理规则一致；前后端同源部署时不需要 `baseURL`（`src/app.tsx` 里 `baseURL: ''`）。
- 查询条件放 `params`，请求体放 `data` —— 这条约定由服务层的契约测试锁住。
- 分页响应的约定形状是 `{ items, total }`；页面需要的「一页数据 + 总数」由页面内的纯逻辑模块（如 `pages/sample/list/listQuery.ts`）转换并兜底，服务层不替页面做决定。
- 响应类型写在服务文件里并导出，页面直接引用，避免两处定义漂移。

## 错误契约（RFC 7807）

后端错误体按 [Problem Details](https://www.rfc-editor.org/rfc/rfc9457) 约定（与本仓库配套的后端底座 `backend-monolith` 一致）：

```jsonc
{
  "type": "...", "title": "...", "status": 400, "detail": "...",
  "errors": [{ "field": "name", "message": "名称不能为空", "rejectedValue": "" }]
}
```

`src/requestErrorConfig.ts` 负责把它变成用户能看懂的一句话：

- 有 `errors[]`：优先展示字段级消息（能定位到字段），多条用「；」连接；
- 没有 `errors[]`：退回 `detail`，再退回 `title`；
- 有响应但不是问题详情（例如网关返回 HTML 错误页）：带上状态码，避免与「后端无响应」混淆；
- 请求未到后端且浏览器离线：提示网络不可用（断网横幅见 `src/components/OfflineBanner`）；
- 提示走 antd `<App>` 的 message 实例（`src/components/AntdMessageBridge` 把它交给非组件代码），这样主题与语言才生效。

个别请求不需要全局提示（例如页面自己展示失败态的健康检查），传 `skipErrorHandler: true`，并在调用处自行处理。

## mock

`mock/<资源>.ts` 提供开发期假数据，只在 `npm start` 生效（`npm run dev` 用 `MOCK=none` 关掉）。

- 只用它把页面点通，不要在里面写业务规则；
- 返回体刻意与 `src/services/` 的约定一致（含 RFC 7807 形状的错误体），这样错误分支也能在本地看到；
- 接上真实后端后，`mock/` 可以直接删。

## 数据加载方式

优先用 ProComponents 自带的请求能力，它们已经处理好 loading、重试与竞态：

1. 列表：`<ProTable request={...} />`，请求函数里把表单参数交给服务层，返回 `{ data, total, success }`；
2. 详情：`<ProDescriptions request={...} />`，返回 `{ data, success }`；
3. 表格里的下拉/枚举选项：`valueEnum` 或 `request`（ProForm 的 `ProFormSelect`）。

不要在页面里手写 `useEffect` + `useState` 拉数据：那是这类后台最常见的技术债来源（loading 与竞态都要自己管）。确实需要客户端缓存、失效与重试策略时（多页面共享的服务端状态、乐观更新），再引入 `@tanstack/react-query`；只用一次的数据不值得多一层抽象。

## 状态管理

- **服务端状态**：交给上面那套请求机制，不要复制进全局 store；
- **跨页面共享的本地状态**：用 umi 的 `useModel`（模型放 `src/models/`，按需新建）；初始状态（当前用户、布局设置）走 `src/app.tsx` 的 `getInitialState`；
- **页面内状态**：`useState` 足够，不要为单个页面引入全局 store。
