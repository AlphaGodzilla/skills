# OMF 模型审计器 MVP

供程序员审查 ontology-modeling 输出的 YAML。交付文件是同目录的 **omf-auditor.html**；使用时只需这个文件，不需要 Node、服务器或联网。

## 使用

1. 用近期 Chrome / Edge / Firefox 打开 omf-auditor.html，先点“加载合同示例”体验。
2. 点“导入 YAML”多选模型文件，或在“导入文件”页选择模型 yaml 目录。也可拖放多份 YAML 文件。
3. 在左侧按名称、ID、文件名搜索或筛选。对象页展开关联卡片，场景页展开关联定义；“全部字段”保留模型原值，“引用关系”展示向外引用和被引用位置。
4. 点字段旁的 # 或原文按钮，在右侧定位源文件行号；右侧原文每次显示最多 120 行，可跳转或翻页。
5. 在右侧记录“待审阅 / 通过 / 需修改”和备注，最后点“导出审阅”。JSON 记录包含模型元素 ID、来源路径、原始文件 SHA-256、人工结论和基础检查提示。

## 导入行为与安全边界

- 所有处理在当前页面内存中完成，无上传、CDN、遥测、localStorage 或 IndexedDB。HTML 带 connect-src 'none' 的 CSP。
- 多次导入会追加文件；同路径文件会替换。目录导入保留相对路径；普通文件选择无法区分来自不同目录的同名文件。
- 任一文件解析失败则整批不生效，保留当前模型与审阅记录。成功导入会重建索引并清空审阅记录；有未导出记录时先确认。
- 刷新或关闭页面会清空模型与审阅记录。导出 JSON 暂不支持重新导入恢复，务必另行保存。
- 导出的文件包含人工备注和模型标识，应按项目数据的保密要求保管。
- 支持 UTF-8 的块状 YAML 顶层映射，包括嵌套、注释、多行表达式及有界别名。拒绝重复映射键、多 YAML 文档、自定义 tag、循环别名和 JSON / flow 顶层。
- 安全上限：单文件 12 MiB、合计 40 MiB、最多 80 个文件；每文件语法 / 展开节点各不超过 250,000，嵌套不超过 70 层。超限明确报错。
- 导入值只作为文本显示；不执行规则表达式、伪代码、SQL 或接口调用。

## 检查覆盖

M1–M6、ME 及可选 M7 / MU / MM / MI 的标准根列表进入索引。关联只来自已登记的显式引用字段，不从名称或表达式猜测。

基础检查覆盖已登记的类型化跨模型引用、重复 ID、当前场景 / 流程内的局部 ID、事件生产与规则订阅镜像、部分 M6 活动约束及 M2 / M7 配对。重复 ID 不自动选择定义。未找到定义可能只是尚未导入相关文件。

未知 Ref / Refs 字段在定义页提示，未支持的根键在文件页提示，原始文件仍可按行查看。引用字段的支持范围以 schema.js 为准；属性表达式引用等尚未做完整解析。

对象聚合页显示直接关联，并通过行为 / 事件 / 规则 / 权限扩展一跳，扩展路径会标注。它不是完整依赖闭包。场景和流程按声明顺序展示，不推断执行拓扑。生命周期仅显示声明的状态。权限矩阵只列直接授予，不计算继承和运行时 ABAC 的最终授权。

本工具不替代 omf_validate.py --strict，也不能证明业务规则、状态转换或异常路径正确。MVP 不含语义 diff、全局图和模型编辑功能。

## 维护与验证

源码、测试、依赖清单和构建脚本位于本目录。运行 HTML 不需要安装依赖；仅维护工具时需要 Node.js 22+ 和 npm。

在本目录执行：

```bash
npm ci
npm test
```

`npm test` 包含核心测试与打包 HTML 的 DOM 集成测试；也可分别运行 `npm run test:core`、`npm run test:dom`。测试输出保存在 `/tmp/omf-auditor-dom-*`。

构建按批执行：

1. `npm run build:start`，读取输出中的 `parts`。
2. 按顺序执行 `npm run build:part -- 0` 至 `npm run build:part -- N-1`，每批成功后继续。
3. `npm run build:finish`，将完整构建产物发布为本目录的 `omf-auditor.html`。
4. `npm test`，确认新产物通过回归。

检查点与暂存 HTML 位于 `/tmp/omf-model-auditor-build-*`；完成前不会覆盖现有 HTML。分批写入检查源码摘要和落盘大小，禁止跳过分片。

浏览器测试默认使用 Playwright 管理的 Chromium。在本目录执行：

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/omf-auditor-browsers node node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/omf-auditor-browsers npm run test:browser
```

也可通过 `OMF_CHROMIUM_EXECUTABLE` 显式指定浏览器可执行文件。浏览器测试使用独立临时 profile，截图和导出样本保存在 `/tmp/omf-auditor-browser-*`；不复用用户 profile。宿主沙箱或网络限制可能阻止浏览器测试，DOM 测试不替代浏览器 CSP、布局及下载行为的实测。

工具维护属于独立任务；使用本工具审阅业务模型不改变 skill 的业务建模阶段边界。

内嵌第三方运行依赖为 yaml 2.8.1（ISC）；许可保留在 HTML 内。esbuild、jsdom 和 Playwright 仅用于构建 / 测试，不是使用 HTML 的依赖。

## 设计资料

- [浏览器多标签页审计设计](docs/design/browser-tabs.md)：设计提案，尚未实现；不是当前版本的使用步骤。
- [架构决策索引](docs/adr/README.md)：运行形态、共享状态所有权及其取舍。
