package {{package}}.interfaces;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 进程级健康端点：只表达「Web 层可响应」。
 *
 * <p>进程级健康由 actuator 的 {@code /actuator/health} 承担（application.yml 已关闭探针组，
 * 响应稳定为 {"status":"UP"}）；本端点用于前端联调或反向代理的轻量探活。
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP");
    }

    /** 响应体与 actuator 的整体状态同形：{"status":"UP"} */
    public record HealthResponse(String status) {}
}
