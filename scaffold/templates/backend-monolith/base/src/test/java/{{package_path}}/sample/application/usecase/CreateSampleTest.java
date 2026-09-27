package {{package}}.sample.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import {{package}}.sample.application.dto.SampleView;
import {{package}}.sample.domain.error.SampleNameConflictException;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.service.SampleNamingPolicy;
import {{package}}.sample.support.InMemorySampleRepository;

/**
 * 用例单测：用测试替身驱动真实领域逻辑，不启动 Spring 容器、不连数据库。
 *
 * <p>这是新增用例时的默认测试形态；只有需要验证 HTTP 契约时才写 REST 契约测试。
 */
class CreateSampleTest {

    private InMemorySampleRepository repository;
    private CreateSample createSample;

    @BeforeEach
    void setUp() {
        repository = new InMemorySampleRepository();
        createSample = new CreateSample(repository, new SampleNamingPolicy(repository));
    }

    @Test
    void createsAndPersistsSample() {
        SampleView created = createSample.handle(new CreateSample.Command("订单", "说明"));

        assertThat(created.id()).startsWith("SM");
        assertThat(created.name()).isEqualTo("订单");
        assertThat(created.description()).isEqualTo("说明");
        assertThat(created.createdAt()).isEqualTo(created.updatedAt());
        assertThat(repository.findById(SampleId.of(created.id()))).isPresent();
    }

    @Test
    void duplicateNameIsRejectedByNamingPolicy() {
        createSample.handle(new CreateSample.Command("订单", null));

        assertThatThrownBy(() -> createSample.handle(new CreateSample.Command("订单", null)))
                .isInstanceOf(SampleNameConflictException.class);
    }
}
