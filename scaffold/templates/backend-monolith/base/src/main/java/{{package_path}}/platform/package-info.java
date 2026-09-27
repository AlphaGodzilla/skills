/**
 * 跨上下文技术适配层（非限界上下文）：需要框架、但既不属于某个上下文、也不属于共享内核的
 * 技术装配。
 *
 * <p>与另外两个非上下文包的边界：
 * <ul>
 *   <li>{@code shared}：共享内核，零框架依赖，是领域词汇；</li>
 *   <li>{@code interfaces}：进程级入站适配（健康端点、全局 Web 配置）；</li>
 *   <li>{@code platform}：跨上下文的技术装配与出站能力（缓存策略等）。</li>
 * </ul>
 *
 * <p>本包不得依赖任何限界上下文（由 {@code ArchitectureTest} 守护）：它只装基础设施，不认识业务。
 */
package {{package}}.platform;
