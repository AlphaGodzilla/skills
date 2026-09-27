package {{package}}.platform.cache;

/**
 * 缓存名集中登记处。
 *
 * <p>缓存名是字符串，散落在注解里就会拼错且无人发现。所有 {@code @Cacheable} /
 * {@code @CacheEvict} 的 {@code cacheNames} 必须引用这里的常量。
 */
public final class CacheNames {

    /** 示例上下文（sample）单条读取的缓存。 */
    public static final String SAMPLES = "samples";

    private CacheNames() {}
}
