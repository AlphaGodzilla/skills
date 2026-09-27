package {{package}}.sample.domain.model;

import {{package}}.sample.domain.error.InvalidSampleFieldException;
import {{package}}.shared.id.IdPrefix;
import {{package}}.shared.id.Ulid;

/**
 * 样本 id：{@link IdPrefix#SAMPLE} 前缀 + {@value Ulid#LENGTH} 位 ULID 的强类型值对象。
 *
 * <p>选 ULID 的依据：字典序即时间序，无需协调分配。前缀让 id 在日志与 URL 里一眼可辨集合归属。
 * 各上下文的 id 值对象都按这个形状写：规范化、校验前缀、校验 ULID 字符表。
 */
public record SampleId(String value) {

    /** 规范形式的长度：前缀 + ULID。 */
    public static final int LENGTH = IdPrefix.SAMPLE.length() + Ulid.LENGTH;

    public SampleId {
        // raw 只用于错误信息：rejectedValue 保持调用方原样输入，存下来的才是归一化后的规范形式
        String raw = value;
        String normalized = Ulid.normalize(value);
        if (normalized == null || normalized.isEmpty()) {
            throw new InvalidSampleFieldException("id", raw, "样本 id 不能为空");
        }
        if (!normalized.startsWith(IdPrefix.SAMPLE)) {
            throw new InvalidSampleFieldException("id", raw, "样本 id 必须以 " + IdPrefix.SAMPLE + " 开头（集合语义前缀）");
        }
        String ulid = normalized.substring(IdPrefix.SAMPLE.length());
        if (ulid.length() != Ulid.LENGTH) {
            throw new InvalidSampleFieldException(
                    "id", raw, "样本 id 必须是 " + IdPrefix.SAMPLE + " + " + Ulid.LENGTH + " 位 ULID");
        }
        if (!Ulid.isValid(ulid)) {
            throw new InvalidSampleFieldException("id", raw, "样本 id 含非 ULID 字符（Crockford Base32）");
        }
        value = normalized;
    }

    /** 解析外部输入的 id（REST 路径参数等）；大小写归一为规范形式。 */
    public static SampleId of(String raw) {
        return new SampleId(raw);
    }

    /** 生成新 id（前缀 + ULID）；调用方不感知其内部格式。 */
    public static SampleId generate() {
        return new SampleId(IdPrefix.SAMPLE + Ulid.generate());
    }
}
