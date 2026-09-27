package {{package}}.sample.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 样本的 Spring Data JPA 仓储。
 *
 * <p>它不出现在领域层：领域只认 {@code SampleRepository} 端口，由 {@link SampleJpaAdapter}
 * 把本接口的实体操作翻译成领域对象的读写。
 */
public interface SampleJpaRepository extends JpaRepository<SampleJpaEntity, String> {

    boolean existsByName(String name);
}
