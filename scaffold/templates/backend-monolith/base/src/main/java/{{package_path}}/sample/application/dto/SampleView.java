package {{package}}.sample.application.dto;

import java.io.Serializable;
import java.time.Instant;

import {{package}}.sample.domain.model.Sample;

/**
 * 样本的对外视图。
 *
 * <p>实现 {@link Serializable} 是 Redis 缓存的要求：Spring 的 {@code RedisCacheManager} 默认用 JDK
 * 序列化缓存值。用 Caffeine 时该接口无副作用。
 *
 * <p>应用层 DTO 与领域模型分开：领域模型变更时，对外契约不被迫跟着改；对外只暴露字符串 id，
 * 不泄漏值对象的内部结构。
 */
public record SampleView(String id, String name, String description, Instant createdAt, Instant updatedAt)
        implements Serializable {

    private static final long serialVersionUID = 1L;

    public static SampleView of(Sample sample) {
        return new SampleView(
                sample.id().value(),
                sample.name().value(),
                sample.description(),
                sample.createdAt(),
                sample.updatedAt());
    }
}
