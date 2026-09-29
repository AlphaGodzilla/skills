/**
 * @name 开发期代理配置
 * @description 只在 `npm start` / `npm run dev` 的 dev server 生效；生产构建不含代理，前后端同源直连。
 *   目标地址可用环境变量覆盖（见 .env.example）：`API_TARGET=http://x npm run dev`。
 * @doc https://umijs.org/docs/guides/proxy
 */
const DEFAULT_TARGET = 'http://localhost:8080';

export default {
  dev: {
    '/api/': {
      target: process.env.API_TARGET || DEFAULT_TARGET,
      changeOrigin: true,
    },
  },
};
