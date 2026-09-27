package {{package}};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * 工程链路冒烟：应用上下文能起、actuator 健康端点可达。
 *
 * <p>用真实端口而非 mock，确保「起得来服务」这一验收项被测试固定住。测试 profile 见
 * {@code src/test/resources/application-test.yml}：不依赖任何外部数据库与缓存。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ApplicationSmokeTest {

    @LocalServerPort
    private int port;

    @Test
    void actuatorHealthReportsUp() {
        RestTestClient client = RestTestClient.bindToServer()
                .baseUrl("http://localhost:" + port)
                .build();

        client.get()
                .uri("/actuator/health")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(String.class)
                .isEqualTo("{\"status\":\"UP\"}");
    }
}
