package {{package}}.sample.infrastructure;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import {{package}}.sample.domain.repository.SampleRepository;
import {{package}}.sample.domain.service.SampleNamingPolicy;

/**
 * 本上下文的显式装配。
 *
 * <p>领域服务是零框架的纯 Java 类（ArchUnit 守护 {@code ..domain..} 不得依赖 Spring），不能自己标
 * {@code @Component}，因此由 infrastructure 这一层把它注册为 bean。
 *
 * <p>用例带 {@code @Service}、持久化适配器带 {@code @Repository}，由组件扫描装配，不需要在这里声明。
 */
@Configuration(proxyBeanMethods = false)
class SampleConfiguration {

    @Bean
    SampleNamingPolicy sampleNamingPolicy(SampleRepository sampleRepository) {
        return new SampleNamingPolicy(sampleRepository);
    }
}
