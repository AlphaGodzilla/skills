package {{package}}.sample.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import {{package}}.sample.domain.error.InvalidSampleFieldException;
import {{package}}.shared.id.Ulid;

class SampleTest {

    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");
    private static final Instant LATER = Instant.parse("2026-01-02T00:00:00Z");

    @Test
    void createStartsWithEqualTimestampsAndEmptyDescription() {
        Sample sample = Sample.create(SampleId.generate(), SampleName.of("订单"), null, CREATED_AT);

        assertThat(sample.createdAt()).isEqualTo(CREATED_AT);
        assertThat(sample.updatedAt()).isEqualTo(CREATED_AT);
        assertThat(sample.description()).isEmpty();
    }

    @Test
    void renameUpdatesOnlyNameAndUpdatedAt() {
        Sample sample = Sample.create(SampleId.generate(), SampleName.of("订单"), "说明", CREATED_AT);

        sample.rename(SampleName.of("订单 v2"), LATER);

        assertThat(sample.name().value()).isEqualTo("订单 v2");
        assertThat(sample.createdAt()).isEqualTo(CREATED_AT);
        assertThat(sample.updatedAt()).isEqualTo(LATER);
        assertThat(sample.description()).isEqualTo("说明");
    }

    @Test
    void blankNameIsRejected() {
        assertThatThrownBy(() -> SampleName.of("  "))
                .isInstanceOf(InvalidSampleFieldException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void tooLongDescriptionIsRejected() {
        Sample sample = Sample.create(SampleId.generate(), SampleName.of("订单"), "", CREATED_AT);

        assertThatThrownBy(() -> sample.describe("x".repeat(Sample.MAX_DESCRIPTION_LENGTH + 1), LATER))
                .isInstanceOf(InvalidSampleFieldException.class)
                .hasMessageContaining("最长");
    }

    @Test
    void sampleIdRejectsWrongPrefixAndShape() {
        assertThatThrownBy(() -> SampleId.of("XX" + Ulid.generate())).isInstanceOf(InvalidSampleFieldException.class);
        assertThatThrownBy(() -> SampleId.of("SM123")).isInstanceOf(InvalidSampleFieldException.class);
        assertThat(SampleId.generate().value()).startsWith("SM");
    }
}
