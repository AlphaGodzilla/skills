"""frontend-admin 底座的参数与渲染后步骤。

由 ../scripts/scaffold.py 加载。契约见 templates/backend-monolith/template.py 的模块文档。
"""

from __future__ import annotations

import re
from typing import Any

DESCRIPTION = "前端管理后台（Ant Design Pro v6 + Umi Max 4 + React 19 + antd 6）"

PARAMS: list[dict[str, Any]] = [
    {
        "name": "title",
        "help": "站点标题（浏览器标题、布局标题、菜单标题），缺省由项目名推导",
    },
    {
        "name": "api_target",
        "default": "http://localhost:8080",
        "help": "开发期后端代理目标（/api/** 转发到这里）",
    },
]

OPTIONS: list[dict[str, Any]] = [
    {"name": "skip_codegraph", "action": "store_true", "help": "不执行 codegraph init"},
]

# 模板里必须出现的占位符 → 至少出现在多少个模板文件里（文件名与文件内容都算）。
# 引擎在渲染前检查，防止「把渲染结果同步回模板」把占位符覆盖成真实值；
# 有意删掉某处占位符时，同步下调这里的数字。
PLACEHOLDERS = {
    "project_name": 5,
    "title": 4,
    "api_target": 3,
}

# 项目名 → 标题时保留的词形：`admin-web` → `Admin Web`、`crm-api` → `CRM API`
_UPPERCASE = {"ui", "api", "id", "url", "crm", "erp", "wms", "bpm"}


def default_title(name: str) -> str:
    parts = [part for part in re.split(r"[-_.\s]+", name) if part]
    if not parts:
        return name
    words = [
        part.upper() if part.lower() in _UPPERCASE else part[:1].upper() + part[1:]
        for part in parts
    ]
    return " ".join(words)


def variables(options: Any) -> dict[str, str]:
    return {
        "project_name": options.name,
        "title": (options.title or "").strip() or default_title(options.name),
        "api_target": options.api_target,
    }


def overlays(options: Any) -> list[str]:
    return []


def summary(options: Any) -> str:
    values = variables(options)
    return f"title={values['title']} api_target={values['api_target']}"


def post_generate(target: Any, options: Any, helpers: Any) -> None:
    # 前端不生成构建产物：依赖安装交给使用方（npm install），本步骤只建代码索引
    if not getattr(options, "skip_codegraph", False):
        helpers.init_codegraph(target)


def next_steps(options: Any) -> list[str]:
    return [
        "npm install           # 安装依赖（首次；prepare 会自动执行 max setup 生成 .umi）",
        "npm test              # 单元 / 组件 / 服务契约测试",
        "npm run verify        # 完整验收：格式 + 类型 + 测试与覆盖率 + CRAP",
        "npm start             # 启动开发服务器（带 mock，无需后端即可点通页面）",
    ]
