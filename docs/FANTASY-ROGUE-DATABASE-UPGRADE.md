# Fantasy Rogue 历史记录数据库专项审查

本次只修改开发分支并在 Windows 本地验证。没有连接腾讯云，没有读取或修改生产数据库，没有改动原始生产备份。真实生产备份的隔离验证由部署 Codex 完成。

## 发布结论与边界

这是**新增独立表和索引**的兼容性升级，结构设计可用于生产。应先通过下述真实备份副本验证，再在获准的维护窗口受控初始化，最后开放 Rogue 请求。不能把模拟旧库验证当成真实生产备份已验证。

初始化不会执行账号 JSON 迁移，不会删除、覆盖、重命名或重置任何玩家记录；也不改变账号权限、登录配置、游戏数值或存档规则。正常游戏命令仍会按既有业务逻辑更新账号、通关卡及请求回执，不能将本结论扩大为“新版本游玩过程中数据库永远不变”。

## 对象用途

- `rogue_history`：每局结束、失败或主动结束时保存一次复盘快照。内容包括最终层数、结局、祝福、最终队伍与记录到的出战伙伴、招式、加成等。`userid` 是账号归属，`id` 是本局 ID，二者组成主键；`ended` 是写入时的毫秒时间戳；`data` 是 JSON 快照。没有外键级联，也不替换原 `rogue_accounts`、`rogue_cards` 或 `rogue_requests`。
- `rogue_history_owner`：非唯一索引 `(userid, ended DESC)`，支持按账号查询、最新记录优先的分页，每页 12 条。主键本身还会产生 SQLite 内部索引 `sqlite_autoindex_rogue_history_1`，属于建表的正常附带结构。
- 历史记录查询按已授权用户的 ID 隔离。不会将所有人的记录放进公共通关卡画廊。历史记录不会因删除展示用通关卡而删除，也不补造上线前无法还原的完整对局历史。

源码：`server/fantasy-rogue/store-schema.ts`、`store.ts`、`history.ts`、`manager.ts`，以及 `server/chat-plugins/fantasy-rogue.ts`。

## 初始化触发与 SQL

`getRogueManager()` 延迟创建单例。首次需要 manager 的 Rogue 状态、历史、图鉴、画廊或命令请求会构造 `RogueStore`；这不是必然发生在服务启动时，也不应依赖玩家进入之后才执行维护。manager 的创建在具体账号授权检查之前，某些可受理但最终未获准进入游戏的查询也可能触发初始化；它不会因此授予账号内测权限。

修复后由 `openRogueDatabase()` 统一打开连接，保持原有 WAL、`synchronous = FULL` 和 5 秒锁等待设置。`initializeRogueSchema()` 在对象已经齐全时只读检查结构；缺少对象时，在 `BEGIN IMMEDIATE` 事务中执行以下完整 SQL，并在提交前校验字段、主键、索引所属表、顺序、排序方向、唯一性和部分索引标记：

```sql
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS rogue_accounts (
    userid TEXT PRIMARY KEY, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rogue_requests (
    userid TEXT NOT NULL, id TEXT NOT NULL,
    payload TEXT NOT NULL, revision INTEGER NOT NULL,
    PRIMARY KEY (userid, id)
);
CREATE TABLE IF NOT EXISTS rogue_cards (
    id TEXT PRIMARY KEY, userid TEXT NOT NULL, public INTEGER NOT NULL,
    created INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rogue_cards_public
    ON rogue_cards(public, created DESC);
CREATE TABLE IF NOT EXISTS rogue_history (
    userid TEXT NOT NULL, id TEXT NOT NULL,
    ended INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (userid, id)
);
CREATE INDEX IF NOT EXISTS rogue_history_owner
    ON rogue_history(userid, ended DESC);
-- 程序在此处验证结构；任何错误都会回滚，而非执行下一条 COMMIT。
COMMIT;
```

前面三张表和 `rogue_cards_public` 的定义沿用旧版本；对已有对象不执行 ALTER、DROP 或数据重写。不会使用 `user_version` 占用其他数据库迁移的版本号。

不要单独复制 SQL 代替校验工具：`IF NOT EXISTS` 不能识别同名错误结构。程序发现不兼容字段或同名错误索引会报错、回滚本次创建并关闭连接，保留已有对象等待人工调查，不会自动删表重建。

## 失败、并发和容量

- 建索引或结构校验失败：本次事务回滚，避免只建表而没建索引。打开连接后发生异常会显式关闭连接并把错误交给调用者。
- `SQLITE_BUSY`：仍采用 5000 毫秒超时。better-sqlite3 是同步调用，等待期间可能阻塞服务端主线程，包括无关玩家请求。应避免多个进程对同一库争用写锁；不要在玩家高峰首次建表。完整结构重复检查不申请写锁，已测试在 WAL 模式存在另一写事务时能打开并读取旧存档。
- 只读权限、损坏文件、磁盘或 I/O 错误不会触发清库、恢复空白存档或改用另一数据库。初始化失败时 manager 不会被缓存为已就绪；后续请求可能重试并再次失败。Rogue 命令已有错误回复处理，查询错误由聊天命令层记录并提示；不应依赖这些运行时错误作为发布验收。
- `rogue_history` 归档和账号更新、请求回执本来就在同一个游戏写事务中。本次回归确认归档失败时三者一起回滚，避免历史失败但玩家进度单独被保存。恢复磁盘/权限问题后再重试。
- 新建空表和空索引开销很小，但历史快照会逐局增长，当前没有保留条数上限；分页只限制单次返回数量。上线后应监测数据库/WAL、备份大小和写入耗时，不能宣称新增历史没有长期磁盘成本。

## 本地模拟升级验证

测试文件 `test/server/fantasy-rogue-store-schema.js` 使用生产旧版本 `9708438162d207d18134b333da616fc6672fb035` 的 DDL 和合成账号、86 层进行中的旧存档、请求回执、通关卡及无关数据表，不使用真实玩家数据。

覆盖空库创建、旧库升级、精确新增对象、旧行/旧结构/`user_version` 不变、旧账号读取、旧版查询与写入 SQL、同账号重复对局 ID 拒绝、跨账号同 ID 可保存、重复初始化、已有历史保留、同名索引落在错误表、字段不兼容、同名表占用索引名、排序错误、索引创建失败回滚和连接释放、写锁、只读、损坏文件、归档失败时完整游戏事务回滚、隔离验证工具原备份哈希不变和拒绝覆盖已有输出目录。

本轮 Windows 隔离源码验证结果：数据库专项 **19 项通过**（包含真正由 SQLite online backup API 从合成 WAL 数据库生成快照的验证）；服务端相关组首轮 **2996 项通过**，另 1 项因沙箱禁止目录联接而未执行到断言，随后在正常文件权限下重跑 **HTTP 全组 43 项通过**。这些数字有重叠，不相加。客户端 **399 项通过、1 项既有 pending**；两端完整 TypeScript、服务端声明构建、客户端 full 构建及回放构建通过。Windows 缺少 PHP 导致新闻获取使用既有回退，不影响构建完成。新增文件 ESLint 零错误零警告；修改的既有文件与父版本比对未新增 lint 问题，但全仓历史 ESLint 失败并未因此解决，严格 CI 仍可能被这些既有问题阻断。

图标通过本地 HTTP 验证为正确的 32×14 PNG，“震慑”说明通过生成后的客户端数据验证；本轮 Edge 自动化连接超时，没有把这些自动化检查表述为实际浏览器画面复核。真实生产备份未在 Windows 本地取得，因此本轮没有执行真实生产备份验证。

“旧版本兼容”在这里是指：新增表不破坏旧表定义和旧 SQL 的读写。它不承诺旧游戏引擎可以正确继续新版本才有的所有机制/存档内容；游戏代码回滚须另行判断进行中对局的兼容性。

## 部署 Codex 的隔离验证方案

先在**独立源码目录**检出本次服务端发布 SHA，使用现有依赖完成 `node build`。以下命令在该独立源码目录执行，不要在生产代码目录中重新构建，不启动游戏服务。

已留存的部署元数据记载：

- 备份文件：`/var/backups/ps-update/20261026-211412/sqlite/fantasy-rogue.db`
- 大小：331776 字节
- SHA-256：`1eeb46df1e647946c85bb9a03a72f37a47ea75067c4e0e1658b7b3e39baaffac`
- 来源：SQLite online backup API；该快照独立一致。部署方必须复核现有备份清单，不能把路径相同视为哈希已验证。

```sh
umask 077
AUDIT_DIR="$(mktemp -d /var/tmp/ps-rogue-db-check.XXXXXX)"
node tools/validate-fantasy-rogue-database.js \
  /var/backups/ps-update/20261026-211412/sqlite/fantasy-rogue.db \
  1eeb46df1e647946c85bb9a03a72f37a47ea75067c4e0e1658b7b3e39baaffac \
  "$AUDIT_DIR/check"
```

工具先核对源文件哈希，仅把源文件作为字节读取，不对原备份建立 SQLite 连接。若源文件旁存在 WAL，拒绝把它当成独立快照；若输出目录已存在也拒绝继续。随后创建权限受限的新副本，先检查 SQLite 完整性和外键，再对副本执行真实初始化和重复初始化。比较所有既有表的行数/内容哈希、结构、`user_version`，逐个通过新 Store 读取旧账号 JSON，最后复核原备份哈希。报告不输出玩家 ID、存档 JSON 或凭据。

成功条件：退出码 0、`report.json` 的 `ok`/`sourceUnchanged` 为 true、完整性检查通过、原表数据哈希不变、仅新增上述两个命名对象及主键内部索引。检查该报告后，可以在**同一个测试副本**上验证维护入口重复执行：

```sh
node tools/initialize-fantasy-rogue-database.js "$AUDIT_DIR/check/validation-copy.db"
node tools/initialize-fantasy-rogue-database.js "$AUDIT_DIR/check/validation-copy.db"
```

任一检查失败就停止发布并保留现场；不要修改备份或修测试预期。工具不会发起网络请求，不读取运行配置，不调用游戏迁移或玩家命令。审计副本仍包含真实存档，必须按备份同等权限保存，不得提交 Git。

## 正式初始化与回滚建议

**建议受控初始化，不等真实玩家的首次请求。** 先由部署方完成上述真实备份测试和发布审批；维护窗口暂停 Rogue 写请求或停止唯一写入服务，制作并验证新的上线前一致性备份，确认数据库路径/所有者/目录权限，然后由运行服务的同一账号调用维护入口。该工具要求目标文件已存在，路径拼错不会新建一个空库。此步骤会修改正式数据库结构，属于后续部署操作，本轮开发检查没有执行。

不要删除旧库或替换旧库来完成升级。SQLite WAL 文件不能与主数据库分离复制；备份和恢复应使用一致性快照。不要用 root 创建 WAL/SHM 后造成服务账号无法写入。

代码回滚时通常可保留 `rogue_history` 和它的索引，旧代码会忽略它们，不需要 DROP。初始化事务失败时本次新增结构自动回滚，但原有 WAL 连接设置不属于 DDL 事务。若上线后已产生新玩家进度，不得直接用上线前备份覆盖当前库；那会丢失新进度。若确需数据恢复，必须另行批准并保留当前库及 WAL 的一致性备份。
