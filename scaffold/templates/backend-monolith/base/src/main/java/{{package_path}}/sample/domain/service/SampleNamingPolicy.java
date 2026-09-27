package {{package}}.sample.domain.service;

import java.util.Objects;

import {{package}}.sample.domain.error.SampleNameConflictException;
import {{package}}.sample.domain.model.SampleName;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 名称唯一性策略（领域服务）。
 *
 * <p>为什么是领域服务而不是聚合方法：判断「名称是否已被占用」需要读仓储，超出单个聚合的边界。
 *
 * <p>它是零框架的纯 Java 类，不能标 {@code @Component}，由本上下文的
 * {@code SampleConfiguration} 注册为 bean。
 *
 * <p>这是「双保险之一」：先查一次给出可读的 409；并发窗口由持久化的唯一约束兜底（之二），
 * 两道闸门抛同一个 {@link SampleNameConflictException}。
 */
public class SampleNamingPolicy {

    private final SampleRepository repository;

    public SampleNamingPolicy(SampleRepository repository) {
        this.repository = Objects.requireNonNull(repository, "repository");
    }

    /** 名称被占用时抛 {@link SampleNameConflictException}。 */
    public void ensureNameAvailable(SampleName name) {
        if (repository.existsByName(name)) {
            throw new SampleNameConflictException(name);
        }
    }
}
