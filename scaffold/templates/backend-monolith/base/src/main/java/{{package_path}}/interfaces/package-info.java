/**
 * 进程级入站适配层（非限界上下文）：不属于任何限界上下文的端点与 Web 装配。
 *
 * <p>各限界上下文的 REST 控制器与它的异常处理放在所属上下文的 {@code interfaces/rest/}；
 * 本包只承载跨上下文的进程级组件，如健康端点。它不得依赖任何限界上下文的 {@code domain} /
 * {@code infrastructure} / {@code application}（由 {@code ArchitectureTest} 守护）。
 */
package {{package}}.interfaces;
