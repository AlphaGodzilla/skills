package {{package}}.shared.id;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

class UlidTest {

    @Test
    void generatedUlidHasCanonicalShape() {
        String ulid = Ulid.generate();

        assertThat(ulid).hasSize(Ulid.LENGTH);
        assertThat(Ulid.isValid(ulid)).isTrue();
        assertThat(ulid).isUpperCase();
    }

    @Test
    void generatedUlidsDoNotCollide() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 10_000; i++) {
            seen.add(Ulid.generate());
        }

        assertThat(seen).hasSize(10_000);
    }

    @Test
    void invalidValuesAreRejected() {
        assertThat(Ulid.isValid(null)).isFalse();
        assertThat(Ulid.isValid("")).isFalse();
        assertThat(Ulid.isValid("0".repeat(Ulid.LENGTH - 1))).isFalse();
        assertThat(Ulid.isValid("!".repeat(Ulid.LENGTH))).isFalse();
        // Crockford Base32 排除 I / L / O / U
        assertThat(Ulid.isValid("I" + "0".repeat(Ulid.LENGTH - 1))).isFalse();
    }

    @Test
    void normalizeTrimsAndUppercases() {
        assertThat(Ulid.normalize(" 01arz  ")).isEqualTo("01ARZ");
        assertThat(Ulid.normalize(null)).isNull();
    }
}
