# 数据与缓存约定

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在改仓储实现、迁移脚本或缓存用法时读。

| 事项 | 约定 |
| --- | --- |
| 连接配置 | `src/main/resources/application-db.yml`；凭据只经环境变量注入，不写进配置文件 |
| 存储异常 | 存储细节不得漏到上层：唯一约束冲突必须变成领域异常（→ 409），库内数据损坏变成 `IllegalStateException`（→ 500），且不要把领域异常挂进 cause 链（会被 REST advice 认领成 400） |
| 缓存用法 | 用例上标 `@Cacheable` / `@CacheEvict`，缓存名引用 `platform.cache.CacheNames`，不写字面量 |
|?if db == "mongodb"
| 唯一索引 | 首次写入前显式建立（见 `SampleMongoRepository`），不要依赖 `auto-index-creation` |
|?endif
|?if db == "postgres" or db == "mysql"
| 表结构 | 由 Flyway 迁移脚本拥有：**禁止修改已提交脚本**，结构变更新增 `V2__*.sql`；`ddl-auto: validate` 在启动时核对实体与库结构，不一致直接启动失败 |
|?endif
|?if cache == "redis"
| 缓存序列化 | `RedisCacheManager` 默认 JDK 序列化，**被缓存的返回值必须实现 `java.io.Serializable`** |
|?endif
