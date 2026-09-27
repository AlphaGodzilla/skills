# MADR 4.0.0 模板与状态流转

本文件是 ADR 实例的复制源。`SKILL.md` 规定何时使用与如何填写，这里只放需要原样复制的内容：模板全文、可选元素说明、状态流转图。

## 一、模板全文

复制到 `docs/adr/adr-template.md`，每个实例复制一份并替换全部 `{}` 占位。

```markdown
---
status: "{proposed | rejected | accepted | deprecated | superseded by ADR-0123}"
date: {YYYY-MM-DD，决策最后一次更新的日期}
decision-makers: {参与决策的人；AI 助手不得写入自己}
consulted: {征求意见的对象}
informed: {仅被告知进展的对象}
---

# {简短标题：点出问题与方案}

## Context and Problem Statement

{两三句话描述上下文与问题，交代「为什么现在必须做这个决策」与影响面。}

## Decision Drivers

* {驱动因素 1：某种力量、关切或约束}
* {驱动因素 2}

## Considered Options

* {方案 1}
* {方案 2}
* {方案 3}

## Decision Outcome

选择「{方案 N}」，因为 {理由：唯一满足某项硬性约束 / 解决了某个驱动因素 / 综合最优}。

### Consequences

* Good, because {正面后果}
* Bad, because {负面后果}

### Confirmation

{如何验证决策被落实并被遵守：设计评审、ArchUnit 测试、验收命令等。}

## Pros and Cons of the Options

### {方案 1}

* Good, because {论据}
* Bad, because {论据}

## More Information

{补充证据、与其它 ADR 的关系、复查触发点。}
```

## 二、可选元素

`Decision Drivers`、`Consequences`、`Confirmation`、`Pros and Cons of the Options`、`More Information` 在 MADR 中都是可选元素。小决策可以省略 `Pros and Cons` 的逐项展开，但 `Consequences` 必须同时给出 Good 与 Bad。

## 三、状态流转

```
proposed ──用户确认──→ accepted ──无替代地失效──→ deprecated
    │                     │
    │                     └──被替代──→ superseded by ADR-XXXX
    └──否决（值得留档时）──→ rejected
```

规则：

- 永不删除 ADR 文件；永不改写 `accepted` ADR 的 Decision、Context、Options 正文。
- 唯一允许对旧 ADR 的修改：`status` 行（`deprecated` 或 `superseded by ADR-XXXX`）与 `date`。
- 被取代时双向引用：旧 ADR 的 `status` 写新编号；新 ADR 在 `Decision Outcome` 或 `More Information` 写 `Supersedes ADR-XXXX` 并链接旧文件。

## 四、常见填写错误

| 错误 | 反例 | 正例 |
| --- | --- | --- |
| 标题含糊 | Database Choice | Use PostgreSQL for the primary datastore |
| 理由空转 | 选 A 因为更好 | 选 A，因为它是唯一满足「单机部署 + 无外部依赖」硬约束的方案 |
| 备选凑数 | 方案 2：不做 | 方案 2：沿用现有 Cron 任务；否决理由：无法在 5 分钟内完成重放 |
| 只有收益 | Consequences 只有 Good | 同时写明新增的维护负担、被放弃的能力 |
| 编造历史 | 当时团队讨论后一致认为…… | `UNCONFIRMED:` 当时的讨论记录未找到 |
