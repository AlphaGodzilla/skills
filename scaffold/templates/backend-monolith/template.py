"""backend-monolith 底座的参数、能力组件与渲染后步骤。

由 ../scripts/scaffold.py 加载。契约（引擎只依赖这些名字）：

    DESCRIPTION  一句话说明，出现在 --help 里
    PARAMS       模板变量参数，对应引擎的 --<名字>；可 required / choices / default / pattern
    OPTIONS      模板专属开关，对应引擎的 --<名字>
    PLACEHOLDERS {占位符: 至少出现多少次}，渲染前校验（防止模板被渲染结果覆盖）
    variables(options)                     -> dict[str, str]，模板占位符的取值
    overlays(options)                      -> list[str]，base 之外还要叠加的组件目录
    summary(options)                       -> str，生成成功那行的后缀
    post_generate(target, options, helpers) -> None，渲染后的动作（wrapper、索引等）
    next_steps(options)                    -> list[str]，下一步命令（不含缩进）
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

DESCRIPTION = "后端单体应用（Spring Boot 4.1 + Java 21 + 六边形分层）"

PARAMS: list[dict[str, Any]] = [
    {
        "name": "package",
        "required": True,
        "help": "基础 Java 包名，如 com.acme.order",
        "pattern": r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*",
        "pattern_error": "--package 不是合法 Java 包名：{value}",
    },
    {
        "name": "db",
        "required": True,
        "choices": ["mongodb", "postgres", "mysql"],
        "help": "数据能力组件：mongodb / postgres / mysql",
    },
    {
        "name": "cache",
        "required": True,
        "choices": ["caffeine", "redis"],
        "help": "缓存能力组件：caffeine / redis",
    },
]

OPTIONS: list[dict[str, Any]] = [
    {"name": "gradle_version", "default": "8.14.3", "help": "生成的 wrapper 版本"},
    {"name": "skip_wrapper", "action": "store_true", "help": "不生成 Gradle wrapper"},
    {"name": "skip_codegraph", "action": "store_true", "help": "不执行 codegraph init"},

]

# 模板里必须出现的占位符 → 至少出现多少次（文件名/目录名与文件内容都算）。
# 引擎在渲染前检查，防止「把渲染结果同步回模板」把占位符覆盖成真实值；
# 有意增删某处占位符时，同步改这里的数字（报错会给出实测次数）。
PLACEHOLDERS = {
    "package": 121,
    "package_path": 47,
    "project_name": 9,
    "app_class": 5,
    "db_name": 4,
    "db_user": 4,
    "cache": 3,
    "db": 3,
    "db_password": 3,
    "db_port": 2,
    "jdbc_url": 2,
    "jdbc_driver": 1,
}

# 组件目录名相对模板根目录。底座是唯一的应用模板，数据库与缓存是它的两个可选能力组件；
# postgres 与 mysql 共用 data-jpa 组件，靠变量与条件块区分。
DATA_COMPONENTS = {
    "mongodb": "components/data-mongodb",
    "postgres": "components/data-jpa",
    "mysql": "components/data-jpa",
}
CACHE_COMPONENTS = {"caffeine": "components/cache-caffeine", "redis": "components/cache-redis"}


def app_class_of(name: str) -> str:
    """`order-service` → `OrderServiceApplication`。"""
    parts = [p for p in re.split(r"[-_.\s]+", name) if p]
    if not parts:
        raise SystemExit("--name 不能为空")
    return "".join(p[:1].upper() + p[1:] for p in parts) + "Application"


def variables(options: Any) -> dict[str, str]:
    name, package, db, cache = options.name, options.package, options.db, options.cache
    db_name = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "app"
    values = {
        "project_name": name,
        "package": package,
        "package_path": package.replace(".", "/"),
        "app_class": app_class_of(name),
        "db": db,
        "cache": cache,
        "db_name": db_name,
        # 关系库的应用账号：postgres 用超级用户 postgres；mysql 不能用 root ——
        # 官方 mysql 镜像明确拒绝 MYSQL_USER=root（entrypoint 直接退出），因此改用普通账号 app
        "db_user": "postgres" if db == "postgres" else ("app" if db == "mysql" else ""),
        "db_password": "postgres" if db == "postgres" else ("app" if db == "mysql" else ""),
    }
    if db == "postgres":
        values.update(
            {
                "db_platform": "postgresql",
                "jdbc_driver": "org.postgresql.Driver",
                "jdbc_url": f"jdbc:postgresql://localhost:5432/{db_name}",
                "hibernate_dialect": "org.hibernate.dialect.PostgreSQLDialect",
                "db_port": "5432",
            }
        )
    elif db == "mysql":
        values.update(
            {
                "db_platform": "mysql",
                "jdbc_driver": "com.mysql.cj.jdbc.Driver",
                "jdbc_url": (
                    f"jdbc:mysql://localhost:3306/{db_name}"
                    "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&characterEncoding=utf8"
                ),
                "hibernate_dialect": "org.hibernate.dialect.MySQLDialect",
                "db_port": "3306",
            }
        )
    else:  # mongodb
        values.update(
            {
                "db_platform": "",
                "jdbc_driver": "",
                "jdbc_url": "",
                "hibernate_dialect": "",
                "db_port": "27017",
            }
        )
    return values


def overlays(options: Any) -> list[str]:
    """组装顺序：应用底座 + 数据能力组件 + 缓存能力组件。"""
    return [DATA_COMPONENTS[options.db], CACHE_COMPONENTS[options.cache]]


def summary(options: Any) -> str:
    return f"db={options.db} cache={options.cache}"


def post_generate(target: Path, options: Any, helpers: Any) -> None:
    if not getattr(options, "skip_wrapper", False):
        _generate_wrapper(target, options.gradle_version, helpers)
    if not getattr(options, "skip_codegraph", False):
        helpers.init_codegraph(target)


def next_steps(options: Any) -> list[str]:
    return [
        "./gradlew test        # 单元与契约测试（不需要任何外部依赖）",
        "./gradlew build       # 完整验收：测试 + ArchUnit 架构守护 + 格式检查",
        "scripts/dev-it.sh     # 集成测试（podman 起真实数据库，跑完自动删容器）",
        "./gradlew bootRun     # 启动服务",
    ]


def _generate_wrapper(project_dir: Path, gradle_version: str, helpers: Any) -> None:
    gradle = helpers.which("gradle")
    if gradle is None:
        print("⚠️  未找到 gradle，跳过 wrapper 生成；请安装 Gradle 后在项目根执行：gradle wrapper")
        return
    result = helpers.run(
        [gradle, "wrapper", "--gradle-version", gradle_version, "--no-daemon", "-q"],
        cwd=project_dir,
    )
    if result.returncode != 0:
        print("⚠️  生成 Gradle wrapper 失败，请手动执行 `gradle wrapper`：")
        print(result.stderr.strip())
    else:
        print(f"已生成 Gradle wrapper（{gradle_version}）")
