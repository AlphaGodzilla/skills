package {{package}}.sample;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * 集成测试样例：跑真实数据库（不用 H2、不用测试替身）。
 *
 * <p>它验证只有真实数据库才能证明的东西：Flyway 迁移 / 集合结构、唯一约束、适配器的读写与异常翻译。
 * 契约测试（{@code SampleRestContractTest}）只验证 HTTP 与用例契约，不覆盖这些。
 *
 * <p>只由 {@code scripts/dev-it.sh} 运行：脚本用 podman 起容器、把连接信息经 {@code IT_*} 环境变量交给
 * 本类（见 {@link #containerConnection}），并在脚本退出时（成功、失败、Ctrl-C 都算）删除容器。直接跑
 * {@code ./gradlew test} 不会执行本类，因为它带 {@code @Tag("integration")} 且默认被排除。
 *
 * <p>新增集成测试照抄这个形状：类名以 {@code IT} 结尾、带 {@code @Tag("integration")}、复制
 * {@link #containerConnection}、不激活 {@code test} profile（那个 profile 会把数据源换成 H2）。
 */
@Tag("integration")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SampleIntegrationIT {

    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT =
            new ParameterizedTypeReference<>() {};

    @LocalServerPort
    private int port;

    /**
     * 把 {@code dev-it.sh} 提供的容器连接信息注入 Spring，而不是让脚本导出 {@code SPRING_*}。
     *
     * <p>理由：环境变量的优先级高于 profile 文件，脚本若导出 {@code SPRING_DATASOURCE_URL}，会盖掉
     * {@code application-test.yml} 里给单元与契约测试准备的 H2 配置，把「离线可跑」的测试变成依赖容器
     * （实测会让 7 个非集成测试失败）。用 {@code IT_*} 命名空间后，只有本类看得见真实库。
     *
     * <p>三个数据能力都注册一遍：实际生效的只有当前组合存在的那组（其余属性没有对应的自动配置，无副作用）。
     */
    @DynamicPropertySource
    static void containerConnection(DynamicPropertyRegistry registry) {
        boolean anyPresent = false;
        anyPresent |= register(registry, "spring.mongodb.uri", "IT_MONGODB_URI");
        anyPresent |= register(registry, "spring.datasource.url", "IT_DB_URL");
        register(registry, "spring.datasource.username", "IT_DB_USERNAME");
        register(registry, "spring.datasource.password", "IT_DB_PASSWORD");
        anyPresent |= register(registry, "spring.data.redis.host", "IT_REDIS_HOST");
        register(registry, "spring.data.redis.port", "IT_REDIS_PORT");

        if (!anyPresent) {
            throw new IllegalStateException(
                    "集成测试需要真实数据库容器：请用 scripts/dev-it.sh 运行 —— 它用 podman 起容器、导出" + " IT_* 环境变量，并在结束时删除容器。");
        }
    }

    private static boolean register(DynamicPropertyRegistry registry, String property, String envName) {
        String value = System.getenv(envName);
        if (value == null || value.isBlank()) {
            return false;
        }
        registry.add(property, () -> value);
        return true;
    }

    private RestTestClient client() {
        return RestTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    /** 名称加随机后缀：集成测试的库也可能被复用，避免历史数据造成假冲突。 */
    private static String uniqueName(String prefix) {
        return prefix + "-it-" + UUID.randomUUID().toString().substring(0, 8);
    }

    @Test
    void createReadListAndDeleteAgainstRealDatabase() {
        String name = uniqueName("订单");

        Map<String, Object> created = client().post()
                .uri("/api/samples")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", name, "description", "集成测试写入"))
                .exchange()
                .expectStatus()
                .isCreated()
                .expectBody(JSON_OBJECT)
                .returnResult()
                .getResponseBody();

        assertThat(created).isNotNull();
        String id = (String) created.get("id");
        assertThat(id).startsWith("SM");

        client().get()
                .uri("/api/samples/" + id)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.name")
                .isEqualTo(name);

        client().get()
                .uri("/api/samples?page=1&size=50")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.items[?(@.id=='" + id + "')]")
                .exists();

        client().delete().uri("/api/samples/" + id).exchange().expectStatus().isNoContent();
        client().get().uri("/api/samples/" + id).exchange().expectStatus().isNotFound();
    }

    /**
     * 唯一性约束必须由数据库兜住（领域服务先查是第一道，唯一索引 / 唯一约束是第二道）。
     * 这条断言在 H2 与内存替身上都证明不了：它验的是真实库的约束确实建起来了。
     */
    @Test
    void duplicateNameIsRejectedByRealDatabaseConstraint() {
        String name = uniqueName("客户");

        client().post()
                .uri("/api/samples")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("name", name, "description", ""))
                .exchange()
                .expectStatus()
                .isCreated();

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
    }
}
