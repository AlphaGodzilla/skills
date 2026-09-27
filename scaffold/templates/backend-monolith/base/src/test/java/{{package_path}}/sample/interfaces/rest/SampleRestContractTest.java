package {{package}}.sample.interfaces.rest;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.client.RestTestClient;

import {{package}}.sample.support.InMemorySampleRepository;

/**
 * 样本的 REST 契约测试：跑完整的 MVC 与用例链路，但把仓储换成测试替身。
 *
 * <p>这样无数据库的环境（CI）也能验证「201 + Location」「结构化 409 / 400 / 404」「204 后 404」
 * 这些契约本身。真实数据库的读写由数据能力组件自己的集成测试覆盖。
 *
 * <p>测试替身与缓存都是单例 bean，会跨测试方法复用，因此每个方法前清空二者，方法之间互不影响。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(SampleRestContractTest.TestRepositoryConfiguration.class)
class SampleRestContractTest {

    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT =
            new ParameterizedTypeReference<>() {};

    @LocalServerPort
    private int port;

    @Autowired
    private InMemorySampleRepository repository;

    @Autowired
    private CacheManager cacheManager;

    @TestConfiguration
    static class TestRepositoryConfiguration {

        /** 换掉真实持久化适配器：契约测试不依赖数据库 */
        @Bean
        @Primary
        InMemorySampleRepository inMemorySampleRepository() {
            return new InMemorySampleRepository();
        }
    }

    @BeforeEach
    void resetState() {
        repository.clear();
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    }

    private RestTestClient client() {
        return RestTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    @Test
    void createReturns201WithLocationAndEchoesFields() {
        String name = uniqueName("订单");

        Map<String, Object> body = client().post()
                .uri("/api/samples")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", name, "description", "说明"))
                .exchange()
                .expectStatus()
                .isCreated()
                .expectHeader()
                .valueMatches("Location", "/api/samples/SM[0-9A-HJKMNP-TV-Z]{26}")
                .expectBody(JSON_OBJECT)
                .returnResult()
                .getResponseBody();

        assertThat(body).isNotNull();
        assertThat((String) body.get("id")).matches("SM[0-9A-HJKMNP-TV-Z]{26}");
        assertThat(body.get("name")).isEqualTo(name);
        assertThat(body.get("description")).isEqualTo("说明");
        assertThat(body.get("createdAt")).isEqualTo(body.get("updatedAt"));
    }

    @Test
    void duplicateNameReturnsStructuredConflictInsteadOf500() {
        String name = uniqueName("订单");
        createSample(name);

        Map<String, Object> problem = client().post()
                .uri("/api/samples")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", name, "description", ""))
                .exchange()
                .expectStatus()
                .isEqualTo(HttpStatus.CONFLICT)
                .expectBody(JSON_OBJECT)
                .returnResult()
                .getResponseBody();

        assertThat(problem).isNotNull();
        assertThat(problem.get("title")).isEqualTo("样本名称冲突");
        assertThat(problem.get("errors")).isNotNull();
    }

    @Test
    void blankNameReturns400WithFieldErrors() {
        Map<String, Object> problem = client().post()
                .uri("/api/samples")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", "  ", "description", ""))
                .exchange()
                .expectStatus()
                .isBadRequest()
                .expectBody(JSON_OBJECT)
                .returnResult()
                .getResponseBody();

        assertThat(problem).isNotNull();
        assertThat(problem.get("errors")).isNotNull();
    }

    @Test
    void unknownIdReturns404() {
        client().get()
                .uri("/api/samples/SM" + "0".repeat(26))
                .exchange()
                .expectStatus()
                .isNotFound();
    }

    @Test
    void listReturnsPageWithTotal() {
        createSample(uniqueName("订单"));
        createSample(uniqueName("客户"));

        client().get()
                .uri("/api/samples?page=1&size=10")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.total")
                .isEqualTo(2)
                .jsonPath("$.page")
                .isEqualTo(1)
                .jsonPath("$.items.length()")
                .isEqualTo(2);
    }

    @Test
    void deleteThenGetReturns404() {
        String id = createSample(uniqueName("订单"));

        client().delete().uri("/api/samples/" + id).exchange().expectStatus().isNoContent();
        client().get().uri("/api/samples/" + id).exchange().expectStatus().isNotFound();
        client().delete().uri("/api/samples/" + id).exchange().expectStatus().isNotFound();
    }

    /** 名称在库内唯一：每次用带随机后缀的名字，避免测试之间相互干扰。 */
    private static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private String createSample(String name) {
        Map<String, Object> body = client().post()
                .uri("/api/samples")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", name, "description", ""))
                .exchange()
                .expectStatus()
                .isCreated()
                .expectBody(JSON_OBJECT)
                .returnResult()
                .getResponseBody();
        assertThat(body).isNotNull();
        return (String) body.get("id");
    }
}
