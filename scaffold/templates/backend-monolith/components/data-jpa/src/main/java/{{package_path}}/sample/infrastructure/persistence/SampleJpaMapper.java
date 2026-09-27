package {{package}}.sample.infrastructure.persistence;

import {{package}}.sample.domain.model.Sample;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.model.SampleName;

/**
 * 领域模型 ↔ JPA 实体的映射。
 *
 * <p>重建时经值对象工厂（{@code of}）而不是直接 new：库里若存在不合规数据，问题会在读取处立刻以
 * 结构化异常暴露，而不是让非法值悄悄流进领域对象。这些异常是库内数据问题而非调用方输入错误，
 * 因此统一包装为 {@link IllegalStateException}（→ 500），不借领域异常被 REST advice 映射成 400。
 */
final class SampleJpaMapper {

    private SampleJpaMapper() {}

    static SampleJpaEntity toEntity(Sample sample) {
        SampleJpaEntity entity = new SampleJpaEntity();
        entity.setId(sample.id().value());
        entity.setName(sample.name().value());
        entity.setDescription(sample.description());
        entity.setCreatedAt(sample.createdAt());
        entity.setUpdatedAt(sample.updatedAt());
        return entity;
    }

    static Sample toDomain(SampleJpaEntity entity) {
        try {
            return Sample.reconstitute(
                    SampleId.of(entity.getId()),
                    SampleName.of(entity.getName()),
                    entity.getDescription(),
                    entity.getCreatedAt(),
                    entity.getUpdatedAt());
        } catch (RuntimeException e) {
            throw persistenceFailure("样本表数据不可用，无法按库中值重建领域对象（row id=%s）：%s".formatted(entity.getId(), e), e);
        }
    }

    /**
     * 「库内数据不合法」的服务端失败包装（→ 500）。
     *
     * <p>刻意不把原始异常挂到 {@code cause} 上：Spring 的异常处理器在找不到 {@link IllegalStateException}
     * 的处理方法时会沿 {@code getCause()} 递归查找，领域异常一旦进入 cause 链，就会被 REST advice 认领并
     * 映射成 400（把库内损坏数据算到调用方头上）。原始异常改挂 {@code suppressed}，根因仍在日志里。
     */
    private static IllegalStateException persistenceFailure(String message, RuntimeException cause) {
        IllegalStateException failure = new IllegalStateException(message);
        failure.addSuppressed(cause);
        return failure;
    }
}
