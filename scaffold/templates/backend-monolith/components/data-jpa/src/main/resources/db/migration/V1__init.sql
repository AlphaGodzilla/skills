-- 样本表（示例）。
-- 列类型按 Hibernate 对 java.time.Instant 的默认映射写：PostgreSQL 用 timestamptz，MySQL 用 datetime(6)。
-- 迁移脚本一旦提交不得修改，结构变更请新增 V2__*.sql。
--?if db == "postgres"
create table samples
(
    id          varchar(32)  not null,
    name        varchar(64)  not null,
    description varchar(1024) not null,
    created_at  timestamp(6) with time zone not null,
    updated_at  timestamp(6) with time zone not null,
    constraint pk_samples primary key (id),
    constraint uq_samples_name unique (name)
);
--?endif
--?if db == "mysql"
create table samples
(
    id          varchar(32)   not null,
    name        varchar(64)   not null,
    description varchar(1024) not null,
    created_at  datetime(6)   not null,
    updated_at  datetime(6)   not null,
    constraint pk_samples primary key (id),
    constraint uq_samples_name unique (name)
) engine = InnoDB
  default charset = utf8mb4;
--?endif
