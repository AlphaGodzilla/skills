/**
 * 示例限界上下文（占位，新建项目后请整体替换）。
 *
 * <p>它存在的意义是把分层骨架跑通一次：领域模型与仓储端口、应用用例与 DTO、基础设施持久化适配、
 * REST 接口与异常映射、以及缓存注解的用法各有一处样例。业务落地时按同样的形状新增真实上下文，
 * 并删除本包。
 *
 * <p>分层（六边形）：
 * <ul>
 *   <li>{@code domain}：聚合、值对象、领域服务、仓储端口、领域异常。零框架依赖；</li>
 *   <li>{@code application}：用例（事务与编排）与对外 DTO；只依赖本上下文 domain 与共享内核；</li>
 *   <li>{@code infrastructure}：仓储端口的实现与显式装配；依赖本上下文 domain 与框架；</li>
 *   <li>{@code interfaces}：REST 控制器与异常映射；只依赖本上下文 application 与 domain.error。</li>
 * </ul>
 */
package {{package}}.sample;
