# Fantasy AI 战术推断与评测

2026-09-25。本轮在原有 Fantasy 原生引擎、规则策略和有限推演上增强判断。两档共用决策算法、评分、候选数量、搜索深度和调度预算；差别只来自 [信息权限](AI-FANTASY-INFORMATION.md)。

## 研究范围

阅读此前检索到的项目中与选招、换人、状态评估、搜索和对照评测直接相关的实现。以下为参考入口，不表示已经逐行审计这些游戏、框架的全部代码。

| 项目与源码 | 本轮吸收的思路 | Fantasy 实现位置 |
|---|---|---|
| [pokeemerald-expansion：选招](https://github.com/rh-hideout/pokeemerald-expansion/blob/0a9c697c769753aef4db82b0da87f0c904399bac/src/battle_ai_main.c)、[换人](https://github.com/rh-hideout/pokeemerald-expansion/blob/0a9c697c769753aef4db82b0da87f0c904399bac/src/battle_ai_switch.c) | 按换入后的钉子、能力变化、天气与场地重新评估对位 | `matchup.ts`、`policy.ts` |
| [CFRU：换人](https://github.com/Skeli789/Complete-Fire-Red-Upgrade/blob/b637a27898b14e25dd24d0f69a3e302f0069deb8/src/Battle_AI/ai_switching.c)、[高级 AI](https://github.com/Skeli789/Complete-Fire-Red-Upgrade/blob/b637a27898b14e25dd24d0f69a3e302f0069deb8/src/Battle_AI/ai_advanced.c) | 换入是否能接招、入场特性、回复和队伍后续反制价值 | `matchup.ts`、`planning.ts` |
| [foul-play：搜索入口](https://github.com/pmariglia/foul-play/blob/6c467c081e862fb321adb405355beb41aba8e226/fp/search/main.py)、[poke-engine：搜索](https://github.com/pmariglia/poke-engine/blob/main/src/search.rs)、[MCTS](https://github.com/pmariglia/poke-engine/blob/main/src/mcts.rs) | 对配置假设与对手多种应对按概率评估；区分未搜索分支和已完成推演 | `hypotheses.ts`、`rollout.ts` |
| [poke-env：基线策略](https://github.com/hsahovic/poke-env/blob/master/src/poke_env/player/baselines.py) | 招式、强化、钉子和对位的可解释基线，独立评测接口 | `policy.ts`、`offline.ts` |
| [PokéRogue：NPC 行动阶段](https://github.com/pagefaultgames/pokerogue/blob/8555c08c823b856cbec4eb99ca84ea52a955836d/src/phases/enemy-command-phase.ts)、[AI 说明](https://github.com/pagefaultgames/pokerogue/blob/8555c08c823b856cbec4eb99ca84ea52a955836d/docs/enemy-ai.md) | 合法操作优先、换人和招式统一比较、避免无收益换人循环 | `prediction.ts`、原有 `strategy.ts` |
| [Metamon：Agent](https://github.com/UT-Austin-RPL/metamon/blob/0a00a759c9a4382a2877088d828302ec294a05a5/metamon/rl/custom_agent.py)、[对战评测](https://github.com/UT-Austin-RPL/metamon/blob/0a00a759c9a4382a2877088d828302ec294a05a5/metamon/rl/evaluate/h2h/__main__.py) | 将策略输入、行动输出和评测分开；保留旧版本作同条件比较 | `tools/fantasy-ai-benchmark.js` |

这里只借鉴方法并独立实现，没有把其他引擎、模型权重或游戏资源合入服务器。原版预训练策略不能据此视为已经学会幻想杯自定义机制。

## 决策变化

1. **换入后的真实对位。** 独立构造假想对位并运行原生入场事件，处理威吓及免疫、天气／场地特性、岩钉／毒菱／黏黏网、厚底靴、毒系吸收毒菱、入场倒下等。换入后的速度、异常和对手能力变化进入后续伤害判断；原生束缚规则决定影子踩、幽灵与美丽空壳能否换出。
2. **条件招式与锁招。** 突袭、迅雷和快手还击根据假想或已授权读取的对手行动判断，不能对换人或不满足条件的变化招式凭空造成伤害。记录首次行动窗口；讲究锁招会随换出清除，并遵守魔法空间、笨拙等道具失效条件。
3. **从公开信息学习。** 未知特性、道具和能力值继续保留多个假设。出手顺序软调整速度假设；同环境、同公开配置下的非要害、非斩杀伤害软调整攻防假设。保留公共 HP 舍入误差和非零不确定性，不把推测变成隐藏配置的读取。
4. **斩杀区间。** 用原生最低／最高伤害探测区分确定击倒、浮动击倒和确定存活。普通单段攻击的中间概率用区间近似，坚硬、气势披带和自定义减伤由原生端点决定；多段、额外随机效果仍受有限采样约束。
5. **场地与回合顺序。** 招式实际改变天气、场地或屏障后，在先手成功的分支中重新评估对手回击。当前回合的已知操作不会被当成下一回合的固定操作；换人预测先固定对手对当前场上宝可梦的意图，再评估候选，避免对手随着每个候选自动换成最有利的覆盖招式。
6. **保留反制手段与争取翻盘。** 根据对方剩余阵容评估我方队员的独特反制价值，并纳入推演局面分数。落后时降低对结果波动的惩罚，领先时提高稳定性要求；保留合法牺牲、强化、先制和同命等选择。
7. **有限搜索的可信度。** 按已覆盖的对手行动概率决定推演分数能取代多少规则评分。未搜索的应对保留原评分，不把只比较过一个分支误当成已经解决整个局面。
8. **变形后的队伍重建。** 对手 Mega／破画皮后进入后排时，区分初始合法配置和当前形态；复制得到的特性同样作为当前状态恢复，避免把合法的已发生变化误判为非法初始配置，导致普通档频繁停止搜索。
9. **幻想杯公开增伤状态。** 在局部估伤和完整推演中恢复源能释放的连用效果，计算 1.5 倍威力及双方麻痹；恢复噬影力在属性免疫后产生的幽灵招式增伤。

## 复现对照

修改前先构建，并将 `dist/server/fantasy-ai` 复制为同目录的另一个名称，例如 `dist/server/fantasy-ai-baseline-20260925`。目录必须保持相对 `../../sim` 等依赖路径有效，不能只把几个 JS 文件放到任意位置。

修改后重新 `node build`，运行：

```powershell
node tools/fantasy-ai-benchmark.js --baseline dist/server/fantasy-ai-baseline-20260925 --strategy rules --games 2 --max-turns 100
node tools/fantasy-ai-benchmark.js --baseline dist/server/fantasy-ai-baseline-20260925 --strategy rollout --max-rollouts 12 --budget-ms 3000 --games 2 --max-turns 100
```

默认比较 OU、UBUU、UU 三个训练家、普通和高难两档；`--games` 是每个训练家／档位的局数，必须为偶数。每对交换双方位置并保持同一队伍和种子。`--trainers`、`--difficulties` 可以缩小范围；`--current` 可以指定另一份编译模块；`--output` 追加逐局 JSONL 结果。`--opponent-difficulty normal` 可以固定对手的信息权限，再分别以新旧版本作为高难挑战方，核对线上先收到玩家操作再回应的情形。

离线驱动仍通过 `InformationView` 喂给两版策略，不把真实 `Battle` 对象传给策略工厂。双高难交替先提交，后提交方才获得本回合已提交招式，不构造互相提前知道尚未提交操作的局面。

输出包含版本胜负、回合数、非法操作、探测异常和决策耗时。小样本镜像对战用于发现退步，不能代替多队伍、多种子和真人对战的强度评估。有限 12 次推演也不能代表线上完整 10 秒预算的表现。

## 验证记录

- 修改前完整 AI 回归为 222 项通过；修改后为 **243 项通过**，包含新增的 21 项战术测试。原有撤销重选、陈旧结果校验、worker 并发、信息隔离、Mega、钉子和反制场景继续通过。
- 服务端构建成功，定向 ESLint 零警告通过。全仓 TypeScript 检查仍有六处既有错误：`data/mods/gen8/rulesets.ts:98,126`、`data/mods/gen9ssb/scripts.ts:963`、`data/random-battles/gen7/teams.ts:1607`、`server/chat-plugins/othermetas.ts:130,131`；没有新增类型诊断。
- 基线为修改前 `a7ae93e4ee8e` 的编译策略。每局最多 100 回合、每次最多 12 次推演，搜索软预算 3000 ms。12 局镜像对照为新版 **6 胜、6 负**；噬影力修正后另复测 OU 四局，结果仍为 3 胜、1 负。下表使用 OU 复测以及 UBUU、UU 的结果；后两种固定队伍没有噬影力，本轮追加修正没有对应触发条件。

| 训练家 | 普通：新版胜／负 | 高难：新版胜／负 |
|---|---:|---:|
| OU | 2 / 0 | 1 / 1 |
| UBUU | 1 / 1 | 0 / 2 |
| UU | 1 / 1 | 1 / 1 |

这组小样本没有证明整体胜率提高，尤其不能掩盖 UBUU 高难镜像的退步。单独移除新队员价值评分的 UBUU 高难两局对照仍为 0 胜、2 负，不能仅凭这两局把问题归因于保留主力的评分。

12 局汇总均没有非法选择或探测崩溃。新版 547 次决策中规则回退 3 次，旧版 566 次中回退 102 次；新版没有因非法配置、形态能力值或未支持状态而回退，剩下 3 次来自预算。旧版的配置／状态问题占 100 次。新版完成了 5158 次推演，旧版 4514 次。

记录中的平均决策耗时约为新版 823 ms、旧版 578 ms，最大约 3.80 s 与 3.08 s。部分评测进程同时运行，这些数字用于检查计算成本，不代表线上容量或独立压测。离线驱动使用软预算，单次规则评分可能越过 3 秒；线上仍由独立 worker 调度器执行原有 10 秒／关键回合 20 秒硬期限。

补充测试固定同一个旧版普通 UBUU 对手，以相同种子换边，分别让新旧版本作为高难挑战方；信息提交顺序对应线上流程。每次最多 12 次推演、软预算 10000 ms，最多 100 回合。旧版高难 **0 胜、2 负**，新版高难 **1 胜、1 负**，两组均无非法选择或探测崩溃。这说明本次改动在该受控场景有收益，但两局不能建立整体胜率结论。

本机原始记录保存在 `F:\fantasy\.qa-ai-study`：`regression-final.log`、`types-final.log`、`benchmark-final.jsonl`、`benchmark-ou-confirmed.jsonl`、`benchmark-online-hard-new.jsonl`、`benchmark-online-hard-old.jsonl`。研究源码副本和试验策略副本没有加入源代码仓库。

没有修改线上实例配置或重启现有服务器；需要服务端重启后新建挑战来加载更新。
