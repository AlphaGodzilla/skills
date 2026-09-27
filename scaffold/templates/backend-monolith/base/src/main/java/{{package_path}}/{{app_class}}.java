package {{package}};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

/**
 * 应用入口。
 *
 * <p>组件扫描覆盖 {@code {{package}}} 及其子包：各限界上下文、共享内核 {@code shared}、
 * 跨上下文技术适配层 {@code platform} 与进程级适配层 {@code interfaces}。
 *
 * <p>{@code @EnableCaching} 打开 Spring Cache 抽象：缓存注解写在各用例上，具体实现由
 * {@code spring.cache.type} 决定（caffeine 进程内 / redis 分布式）。
 */
@SpringBootApplication
@EnableCaching
public class {{app_class}} {

    public static void main(String[] args) {
        SpringApplication.run({{app_class}}.class, args);
    }
}
