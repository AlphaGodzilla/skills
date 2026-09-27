plugins {
    java
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spotless)
}

group = "{{package}}"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(libs.versions.java.get().toInt())
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(platform(libs.spring.boot.dependencies))

    implementation(libs.spring.boot.starter.web)
    implementation(libs.spring.boot.starter.actuator)
    implementation(libs.spring.boot.starter.cache)
    // API 文档站：springdoc 生成 OAS 3.1，knife4j starter 只提供 UI 与服务端增强。
    // knife4j 4.4.0 传递的 springdoc 2.x 与 Boot 4 冲突，必须 exclude 后自引 Boot 4 专用线
    implementation(libs.springdoc.openapi.starter.webmvc.ui)
    implementation(libs.knife4j.openapi3.jakarta.spring.boot.starter) {
        exclude(group = "org.springdoc")
    }

    //?if db == "mongodb"
    implementation(libs.spring.boot.starter.data.mongodb)
    //?endif
    //?if db == "postgres" or db == "mysql"
    implementation(libs.spring.boot.starter.data.jpa)
    implementation(libs.spring.boot.starter.flyway)
    //?if db == "postgres"
    runtimeOnly(libs.postgresql)
    runtimeOnly(libs.flyway.database.postgresql)
    //?endif
    //?if db == "mysql"
    runtimeOnly(libs.mysql.connector.j)
    runtimeOnly(libs.flyway.mysql)
    //?endif
    // 测试用内存库：JPA 底座的测试 profile 用它，免去外部数据库
    testRuntimeOnly(libs.h2)
    //?endif
    //?if cache == "caffeine"
    implementation(libs.caffeine)
    //?endif
    //?if cache == "redis"
    implementation(libs.spring.boot.starter.data.redis)
    //?endif

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.archunit.junit5)
}

tasks.withType<JavaCompile>().configureEach {
    // 源码与配置含中文注释，固定 UTF-8，避免平台默认编码漂移
    options.encoding = "UTF-8"
    // 保留方法参数名：Spring 的 @PathVariable / @RequestParam 与 SpEL 的 #参数名 都依赖它
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform {
        // 集成测试（@Tag("integration")）需要真实数据库容器，由 scripts/dev-it.sh 用 podman 起；
        // 默认排除它们，保证 ./gradlew test 与 ./gradlew build 不依赖任何外部依赖。
        if (!providers.gradleProperty("includeIntegration").isPresent) {
            excludeTags("integration")
        }
    }
    testLogging {
        events("failed")
    }
}

// ── 代码格式化（Spotless）────────────────────────────────
// 只格式化「相对 HEAD 有改动」的文件（含新增未跟踪文件）：已提交的文件不再进入检查范围，
// 因此不会对既有代码做无差别重排。
//
// ⚠️ ratchet 需要能解析 HEAD：不在 git 仓库内会报 "Cannot find git repository in any parent
//    directory"，git 仓库尚无提交时会报 "No such reference 'HEAD'"，两种都是构建硬失败。
//    因此这里先探测 HEAD 是否存在：探测不到就不启用 ratchet，退化为全量检查 —— 底座源码本身
//    是格式化干净的，所以首次提交前 ./gradlew build 同样能通过。
val gitHeadExists: Boolean = runCatching {
    providers.exec {
        commandLine("git", "rev-parse", "--verify", "--quiet", "HEAD")
        isIgnoreExitValue = true
    }.result.get().exitValue == 0
}.getOrDefault(false)

spotless {
    if (gitHeadExists) {
        ratchetFrom("HEAD")
    }

    java {
        target("src/*/java/**/*.java")
        palantirJavaFormat()
        // 固定 import 分组（java → javax/jakarta → org → 其它第三方 → 本项目）：
        // 不固定的话，palantir 按字母序排，本项目包名会插进第三方中间，格式随包名变化，
        // 模板就无法预先格式化干净。未匹配任何前缀的 import（本项目自己的类）落在最后一组。
        importOrder("java", "javax", "jakarta", "org", "com.tngtech")
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }

    format("misc") {
        target(
            "*.md", "*.yml", "*.yaml", "*.toml", "*.sql", "*.kts", "*.sh",
            "**/*.sh", ".env.example", ".gitignore", ".editorconfig")
        targetExclude("build/**")
        trimTrailingWhitespace()
        endWithNewline()
    }
}

// Boot 插件默认与 bootJar 并存产出 -plain.jar；容器构建用 build/libs/*.jar 复制时会多源失效
tasks.named<Jar>("jar") { enabled = false }
