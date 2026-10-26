# 2026-10-26 Fantasy Rogue 最终本地发布核查

## 结论与范围

本轮服务端、客户端源码通过完整 TypeScript 检查、从空产物目录进行的构建及全量功能回归，可以作为下一步部署核查的输入。GitHub 推送由用户在自己的 Windows PowerShell 中完成；本轮不连接腾讯云、不移动正式分支、不修改生产配置、不部署或重启线上服务。

本轮只整理既有开发内容和证据，没有调整游戏数值、业务行为或测试预期。全仓库 ESLint 尚未清零，详细情况见下文，不能把此结论解读成所有静态规范检查全部通过。

实际工作区是 `F:\fantasy\release-audit-20261022\server` 与 `client`，均为 `codex/fantasy-rogue`。原 `F:\fantasy\pokemon-showdown` 的 master 和原 client 的 fantasy 没有遗漏的未提交业务修改。client 的 fantasy 是开发分支祖先；server 的 master 只有一条独有提交 `5aa08dfbd23282becba29e26a4807973dc19c5a6`，仅在原 `pokemon-showdown` CLI 中增加 7 行本机 Windows 转接，调用仓库外 `../launch-local-development.cjs`，不包含游戏业务修改。该提交保留在原目录，不并入发布开发分支；其父提交及普通对战共享修复均已包含。

## 包含的主要内容

| 范围 | 源码/资料入口 | 自动回归入口 |
| --- | --- | --- |
| 队伍选择、默认护符、档位锁定、无准备确认阶段、世代/属性筛选 | `engine.ts`、`difficulty.ts`、客户端 `client-fantasy-rogue.js` | `fantasy-rogue-opening*`、`fantasy-rogue-starters`、`fantasy-rogue-difficulty*`、客户端 Rogue 测试 |
| 捕捉资质、隐藏特性、稀有度、初始 IV、精英品质祝福伙伴、专属道具线索 | `encounter-quality.ts`、`sim/rogue-quality.ts`、`exclusive-items.ts`、`gifts.ts` | `fantasy-rogue-quality`、`fantasy-rogue-veteran-sniper`、觉醒/遭遇测试 |
| 幻想崩坏 v5、旧局版本兼容、战斗显示与匿名统计 | `sim/rogue-collapse*.ts`、`collapse.ts`、`tools/report-rogue-collapse.js` | `fantasy-rogue-collapse*`，包括保存、换人、多段、替身、伤害分类与新版特性压制 |
| 崩坏回响、适性点、购买和兑换、直接承伤减免、重复系统解锁换礼物 | `echo.ts`、`sim/rogue-echo.ts`、`blessings.ts`、`engine.ts` | `fantasy-rogue-echo`、`fantasy-rogue-collapse-v5` |
| 祝福层数/队伍门槛、每局一次更换整批品阶、未来视、老练狙神、零元购提醒、潘多拉金 | `blessings.ts`、`blessing-selection.ts`、`sim/rogue-blessing-data.ts`、`sim/rogue-sniper.ts` | 祝福选择/战役/说明/新祝福、老练狙神及客户端交互测试 |
| 祝福概率分布、明确的【名称】介绍、招式分类、历史品质颜色 | `docs/fantasy-rogue-blessing-distribution-20261026.*`、`blessing-text.ts`、`move-categories.ts`、客户端 | 说明、图鉴、历史与客户端悬停/点击回归 |
| 同行好感度、50/100 点对话和不同奖励、露莎米奈家庭奇遇与双表情资源 | `affection*.ts`、`lusamine-data.ts`、`rivals.ts`、`travellers.ts` | `fantasy-rogue-journey-systems`、`fantasy-rogue-lusamine`、同行/劲敌测试 |
| 历史对局、太晶碎片归包、大师球稀有事件、神奇糖果、幸运硬币/骰子事件 | `history.ts`、`store.ts`、`tera-shards.ts`、`master-ball.ts`、`luck-events.ts` | 旅途系统、神奇糖果、幸运事件、保存相关回归 |
| 四张首领前卡片、神衣鲜血视觉、攻略加宽/排序/版本提示 | `sim/rogue-mentor.ts`、`beginner-guide.ts`、客户端 CSS 和战斗动画 | 首领支援、开局、觉醒、客户端动画/攻略测试 |
| 幻想/神兽/熊徒弟招式记忆、幻想西狮专属 Z、馆主 AI | `progression.ts`、`encounter-sets.ts`、`data/mods/gen9fantasy/items.ts`、`server/fantasy-ai` | 招式记忆、首领/训练家、AI 推断和战斗测试 |
| 普通对战共享修复 | 已包含的 Charge Beam / 幻想美录梅塔 / Nihil Light 等历史提交，当前 `sim` 入口 | 全量普通对战、各世代、随机队伍及幻想杯回归 |
| HTTP 响应、生成资源与本地开发隔离 | `server/static-server.ts`、客户端构建工具、本地启动工具 | HTTP 专项、本地运行时/启动器、迷你图鉴、资源/登录回归 |

除 `sim`、`data`、`tools` 和客户端明确路径外，上表服务端业务文件位于 `server/fantasy-rogue`，对应测试位于 `test/server`。这些核查证明当前实现和回归覆盖存在，并不声称每种队伍/祝福组合都已经人工打通 200 层。

当前新局规则以 `sim/rogue-collapse-data.ts` 和 `docs/fantasy-rogue-echo.md` 为准。`fantasy-rogue-collapse.md`、旅途系统文档及 10 月 25 日基准保留了旧版本说明和历史测量，不能用其 v3/v4 表格替代 v5；旧局按保存的版本继续运行。

## 本轮实际验证

所有命令在独立源码副本运行，未复制既有 `dist`、数据库、玩家存档或私有配置。依赖使用本机已安装版本；源码清单、文件 SHA-256、日志和产物清单保存在仓库外的 `F:\fantasy\release-final-20261026`。

| 检查 | 命令或方式 | 结果 |
| --- | --- | --- |
| 服务端完整 TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 通过 |
| 服务端干净构建与声明 | `node build --decl` | 通过，生成 1324 个 dist 文件 |
| 服务端全量回归 | `node node_modules/mocha/bin/mocha --forbid-only --grep '.*' --timeout 30000 --reporter dot --exit` | **8008 passing，85 pending，0 failing**；包含默认排除的 slow 项 |
| 客户端完整 TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | 通过 |
| 客户端完整构建 | `node build full --local-server <本轮干净服务端源码目录>` | 通过；显式配对源码，不从 GitHub 同步数据 |
| 客户端全量回归 | `node node_modules/mocha/bin/mocha test/*.js --forbid-only --timeout 30000 --reporter dot --exit` | **396 passing，1 pending，0 failing** |
| 回放构建 | `node build replays`，单独检查退出码 | 通过 |
| HTTP 生命周期专项 | `test/server/static-server.js` | **43 passing**；200/206/304/404/416、HEAD、断开、流错误、SockJS、目录越界和 junction 均覆盖 |
| 当前与旧规则对照 | 20 个配置格式 × 8 支校验队伍 | **160 组一致**，旧可选规则在配置格式中调用 0 次，显式加入的阳性对照调用 1 次 |
| 页面静态资源 | 独立随机 localhost 端口逐一 HTTP GET | 52 个必要脚本/样式均为 200 且非空；迷你图鉴可执行；9 组人物立绘、6 种糖果和露莎米奈头像可读取 |
| 内嵌计算器 | `node build-tools/showdex-assets.js` | 55 个发布文件完整性通过 |
| 差异空白检查 | 两仓库 `git diff --check` | 通过 |

Windows 未安装 PHP 导致可选新闻缓存抓取警告；构建器采用已存在的公告回退。实际生成的首页包含幻想杯内测公告，无失败占位符。JS、数据、页面及回放资源构建成功。此核查不验证生产 PHP 登录或新闻服务。

`testclient-key.js` 是可选开发资源，干净构建未携带真实凭据，也不要求添加。生产发布须保留实际配置及相对链接布局，不能用本轮测试副本的默认配置覆盖生产配置。Git 忽略的 `data/pokedex-mini*.js` 等必须在部署构建时生成并随静态资源发布。

## 24 个历史 dist 文件复核

| 文件类别 | 数量 | 本轮结论 |
| --- | --- | --- |
| 旧 dist 根目录 `.d.ts` | 21 | 均由对应 `sim/*.ts` 重新生成于 `dist/sim/`；非运行时模块 |
| `tsconfig.tsbuildinfo` | 1 | 编译缓存，不作为运行依赖 |
| `data/mods/gen9fantasy/rulesets.js` 与 `.map` | 2 | 不存在于当前源码；当前 20 个配置格式不启用其可选规则；不混入新干净构建，历史备份保留 |

21 个声明文件：`battle-actions`、`battle-queue`、`battle-stream`、`battle`、`dex-abilities`、`dex-conditions`、`dex-data`、`dex-formats`、`dex-items`、`dex-moves`、`dex-species`、`dex`、`field`、`global-types`、`index`、`pokemon`、`prng`、`side`、`state`、`team-validator`、`teams`。

旧规则模块 SHA-256：`13712c0825156d4433996020df99bd24a154b481182ef2d7c3fc0671ddecd15e`。本轮读取先前留存的本地副本并重新核对哈希，没有连接云端。干净 dist 的所有 JavaScript 均可追溯到当前 TypeScript 来源（配置示例单独归类），没有无来源的旧 JavaScript。

此结论针对仓库内 20 个配置格式。部署人员仍须检查生产私有格式是否另行显式引用 `Fantasy Ability Rule`；本轮没有权限或动作去验证云端现状，也不授权直接删除生产旧 dist。

## Windows 专用内容与存档边界

`tools/*local-development*`、两个 PowerShell 启动脚本及相关文档/测试单独归类为开发工具。它们保留原 PowerShell 启动习惯，协调 8000 游戏与 8080 客户端、备份、唯一进程验证及 Ctrl+C 生命周期。它们不是腾讯云启动入口；机器专用的根目录配置、快捷方式、备份和运行记录不入仓库。

普通测试昵称放行仍要求服务端本地开发标志及回环监听，生产注册/内测判断保留；客户端参数不能自行取消生产权限检查。发布流程不运行 Windows 开发启动器，不向生产注入 `FANTASY_AI_LOCAL` 或本地配置。

真实数据库、存档、WAL、SSH 私钥、SID/Cookie、机器配置、临时构建和测试日志全部留在 Git 外。随代码保留的 benchmark JSON 是受控合成对局统计，截图是既有本地 QA 证据，不是玩家存档。曾经按用户要求执行的本地账号重置仅作为历史记录，本次不再重置任何账号。

## 未清零的规范检查与实际验证边界

全仓库 ESLint 退出码为 1：服务端 **13996 errors / 933 warnings**，客户端 **1123 errors / 55 warnings**。在相同配置及当前类型环境下对上一 HEAD 的文件内容复核，基线分别为 **8863 / 815** 和 **1123 / 52**。服务端新增项主要来自新测试/基准脚本的缩进、空格、单行多语句；少量为重复导入、局部变量同名、返回赋值、可选链及冗余断言等代码规范问题。它们没有被修改预期、关闭规则或隐藏输出来“通过”。报告保留完整结果，不能宣称 `npm test`（含 ESLint）已全绿。

这次发布核查重新执行的是源码检查、构建和自动回归，没有重新进行真实 Edge 人工完整 200 层通关，也没有做生产压力测试或线上认证验收。既有 Edge 验收和 432 场受控平衡结果保留在功能文档，不能充当本轮线上验收或完整通关率。回响点满后的长期平衡仍需要正常实战观察。

## 交接

最终提交号和干净状态在提交完成后记录到仓库外 `RELEASE-HANDOFF.md` / `release-verification.json`，避免文档循环引用自身提交。用户手动推送两个 `codex/fantasy-rogue` 后，应核对远端提交与交接 SHA 一致，再交部署 Codex 检查生产差异、备份和发布条件。本轮没有宣称远端已同步。
