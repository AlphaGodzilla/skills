package {{package}}.shared.id;

import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Locale;

/**
 * ULID 的生成与校验（26 位 Crockford Base32，字典序即时间序）。
 *
 * <p>这是共享内核里的纯技术工具，不承载领域语义：各上下文 id 值对象复用它，但调用方不应把
 * ULID 的编码细节当作自己的领域概念。
 *
 * <p>不引入第三方依赖：48 位毫秒时间戳 + 80 位 {@link SecureRandom} 随机数，按 ULID 规范编码；
 * 同一毫秒内多次生成也不会碰撞（随机位不同）。
 */
public final class Ulid {

    /** 规范形式的长度：48 位时间戳编成 10 字符，80 位随机数编成 16 字符 */
    public static final int LENGTH = 26;

    /** Crockford Base32：去掉易混淆的 I、L、O、U；表内字符按 ASCII 升序，故可用二分查找校验 */
    private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

    private static final int TIMESTAMP_CHARS = 10;
    private static final int RANDOM_BYTES = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ulid() {}

    /** 生成新 id：48 位毫秒时间戳 + 80 位随机数，编码为 {@value #LENGTH} 个字符。 */
    public static String generate() {
        long timestamp = System.currentTimeMillis();
        byte[] randomness = new byte[RANDOM_BYTES];
        RANDOM.nextBytes(randomness);

        char[] chars = new char[LENGTH];
        for (int i = TIMESTAMP_CHARS - 1; i >= 0; i--) {
            chars[i] = CROCKFORD[(int) (timestamp & 0x1F)];
            timestamp >>>= 5;
        }
        // 80 位随机数恰好编成 16 个 Base32 字符（80 % 5 == 0），无余位
        int buffer = 0;
        int bitsInBuffer = 0;
        int index = TIMESTAMP_CHARS;
        for (byte b : randomness) {
            buffer = (buffer << 8) | (b & 0xFF);
            bitsInBuffer += 8;
            while (bitsInBuffer >= 5) {
                bitsInBuffer -= 5;
                chars[index++] = CROCKFORD[(buffer >>> bitsInBuffer) & 0x1F];
            }
        }
        return new String(chars);
    }

    /** 值是否为规范形式的 ULID（已大写、{@value #LENGTH} 位、字符表内）；{@code null} 返回 false。 */
    public static boolean isValid(String value) {
        if (value == null || value.length() != LENGTH) {
            return false;
        }
        for (int i = 0; i < LENGTH; i++) {
            if (Arrays.binarySearch(CROCKFORD, value.charAt(i)) < 0) {
                return false;
            }
        }
        return true;
    }

    /** 去掉首尾空白并归一为大写；输入为 {@code null} 时返回 {@code null}。 */
    public static String normalize(String raw) {
        return raw == null ? null : raw.strip().toUpperCase(Locale.ROOT);
    }
}
