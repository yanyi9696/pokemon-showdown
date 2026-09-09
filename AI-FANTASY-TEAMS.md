# 编辑 Fantasy AI 的训练家与队伍

编辑服务端的 `config/fantasy-ai-trainers.ts`。该文件的 `Trainers` 数组中，每个对象就是一个训练家和一套固定队伍；两档难度使用同一套队伍。

玩家先在 AI 挑战页选择赛制，再选择该赛制下的训练家。一个配置项对应一个赛制；同一角色要出现在三个赛制中，就创建三个不同 `id` 的配置项，`name` 和头像可以相同，各自填写对应队伍。

| 页面赛制 | `format` 必须填写 | 引擎现有赛制 |
|---|---|---|
| FC UBUU | `gen9fcubersuu` | [Gen 9] FC Ubers UU |
| FC OU | `gen9fcou` | [Gen 9] FC OU |
| FC UU | `gen9fcuu` | [Gen 9] FC UU |

## 2026-09-09 阿塞萝拉队伍与粗骨头开发约定

本节先于本轮配置与实现修改编写。

- 保留现有 FC OU 阿塞萝拉配置 `acelora-ou`；新增 `acelora-ubuu`（`gen9fcubersuu`）和 `acelora-uu`（`gen9fcuu`），均使用名称「阿塞萝拉」和 `acerola-masters` 头像。普通和高难使用各自赛制的同一支固定队伍。
- 两支新增队伍按用户提供的 Showdown 文本录入，保留物种形态、道具、特性、努力值、性格、个体值、招式和明确填写的太晶属性。未填写的太晶属性沿用引擎默认值。
- UU 的 Marowak-Alola-Fantasy 使用用户随后补充的 `248 HP / 252 Atk / 8 SpD`、`Adamant Nature`，个体值沿用原文默认值。
- 粗骨头的服务端攻击翻倍判定已经按 Cubone / Marowak 的基础物种覆盖 Fantasy 形态。修复客户端道具推荐的对应判定，使 Marowak-Alola-Fantasy 的粗骨头进入该物种的专属道具分组；不将其他道具的形态限定放宽。
- 完成后构建两端，校验全部正式训练家，并检查实际客户端道具分组与粗骨头能力值效果。记录检查结果和服务生效状态。

## 当前训练家：阿塞萝拉

现有正式配置为阿塞萝拉 FC OU 队伍，本轮补充用户提供的 FC UBUU 与 FC UU 队伍。每个赛制使用独立配置，完整配招和能力值以 `config/fantasy-ai-trainers.ts` 为准。

| 页面赛制 | 训练家标识 | 六名成员 |
|---|---|---|
| FC UBUU | `acelora-ubuu` | Mimikyu-Fantasy、Urshifu-Rapid-Strike-G-Mega-Fantasy、Dragapult-Fantasy、Aegislash-Fantasy、Pecharunt-Fantasy、Giratina |
| FC OU | `acelora-ou` | Mimikyu-Fantasy、Skeledirge-Fantasy、Garganacl-Fantasy、Marowak-Alola-Totem-Fantasy、Absol-Mega-Z-Fantasy、Rotom-Fantasy |
| FC UU | `acelora-uu` | Gengar-Fantasy、Cursola-Fantasy、Golurk-Mega、Dusknoir-Fantasy、Aegislash、Marowak-Alola-Fantasy |

启动 / 重启默认 8000 服务后，在 AI 挑战页选择对应赛制，再选择 **阿塞萝拉**。正式配置非空时，原来的三个开发样例不自动回退显示。

## 2026-09-08 四类机制配置开发约定

本节先于本轮配置与实现修改编写。用户已确认保留现有赛制：训练家具备 **Mega、Z 招式、太晶化、气场爆发** 四类选择，Z 招式与气场爆发按局面择一，不能在同一局各用一次。

- 配置 `resourcePreferences: ['mega', 'zmove', 'terastallize', 'aura']`。该字段只影响收益评分；实际候选仍由当前合法请求、队伍携带物和已消耗资源共同决定，不强制在固定回合使用。
- 盔甲鸟改带 `Skarmorite`，承担 Mega 与撒钉职责。继续保留碎菱钢、隐形岩、羽栖和扑击。Mega 后特性变为黄金之躯，不能继续套用进化前战斗盔甲的钉子免疫。
- 第五只改为 `Lurantis-Fantasy @ Grassium Z`。叶刃提供伤害型草 Z；花之舞提供变化型草 Z；同一颗草 Z 也能触发幻想兰螳花的气场爆发。保留穿云作为爆发后飞行本系攻击，急速折返配合伪虫拟态进行轮转。
- 帝王拿波、快龙、武道熊师和鸭嘴炎兽保留已有配装并承担太晶候选；继续由帝王拿波提供清钉。全员仍为 Fantasy 宝可梦；为满足机制条件，道具包含 Mega 石与本地增加了气场功能的草 Z，不再要求六件道具名称都带 `Fantasy`。
- 本地规则依据：`data/mods/gen9fantasy/items.ts` 的 Mega 配对和 `auraBursts`、`scripts.ts` 的 `canUltraBurst` / `runMegaEvo`，以及 `sim/battle-actions.ts` 的 Z 与太晶资格。气场使用 `ultra` 行动协议，消耗 `side.zMoveUsed`；普通奈克洛兹玛的究极爆发与 Fantasy 气场须区分。
- 检查已用 Z 后的气场候选及假想世界资源还原，避免沿用开局缓存的气场按钮重复花费资源。本轮仅调整训练家和 AI 的合法资源判断，不改写玩家赛制。
- 完成后进行构建、定向静态检查与队伍合法性校验；按用户要求不运行测试套件或模拟对战。检查结果另记入进度文档。

本轮已落实上述配置。`actions.ts` 使用自己的行动请求和公开资源消耗共同枚举候选，规则决策、应急回退及假想世界重建共用 Z／气场资格判断，防止 Z 已使用后继续采用缓存的气场资格。构建、五个改动文件的 ESLint、FC OU 六只队伍合法性校验和差异空白检查通过；全仓类型检查仍为已记录的六处既有错误。未运行测试或对战，未重启服务。

## 2026-09-08 历史训练家样例：幻想先锋·岚

此前写入的样例标识为 `fantasy-vanguard-ou`，赛制为 **FC OU**，风格为均衡；当前正式配置已改为上文的阿塞萝拉队伍。以下保留四类机制搭配的历史说明。样例六只宝可梦全部为 Fantasy 形态，道具包含四件 Fantasy 道具、盔甲鸟 Mega 石及增加了气场功能的草 Z，共配置八个 Fantasy 招式。

| 成员 | 携带道具 | 主要职责与特色招式 |
|---|---|---|
| Skarmory-Fantasy | Skarmorite | Mega 防守与撒钉；**Sui Ling Gang（碎菱钢）＋Stealth Rock（隐形岩）**，黄金之躯阻止对手除雾。 |
| Empoleon-Fantasy | Fantasy Protector | 特殊防守、除雾清钉、Bian Su Zhe Fan（变速折返）慢速轮转。 |
| Dragonite-Fantasy | Fantasy Power Lens | Qi Bao Liu Xing（气爆流星）、流星群和大字爆炎获得命中与威力增益，羽栖续航。 |
| Urshifu-Rapid-Strike-2-Fantasy | Fantasy Scope Lens | 格斗／超能的连击流 2；Xing Yi Huan Da（形意幻打）破盾、Huan Shen Bu（幻身步）先制攻击。 |
| Lurantis-Fantasy | Grassium Z | 草 Z／气场爆发择一；叶刃、穿云、花之舞与急速折返，气场形态变为草／飞行。 |
| Magmortar-Fantasy | Fantasy Ring Target | 超级发射器强化炎之波动、龙之波动与波导弹；四攻搭配标靶的变化招式限制。 |

第 3、4、5 只设为关键成员，特殊资源偏好包含全部四类。第 1 只提供 Mega，第 5 只提供 Z／气场两类候选，第 2、3、4、6 只可太晶化。Z 与气场共用一次资源，AI 按局面判断使用时机，也会保留不使用机制的普通行动。碎菱钢与隐形岩的实际撒钉时机同样由策略决定。

该历史样例已不在当前挑战列表中；新增训练家时可以参考其资源搭配，录入方式见下文。

## 编辑方法

1. 在现有队伍编辑器中选好对应赛制，编辑六只宝可梦，使用「导入 / 导出」取得完整的 Showdown 队伍文本。
2. 在 `Trainers` 中新增对象，将导出的全部文本放进 `team` 的反引号字符串中。不要填写压缩队伍代码、数组或文件路径。
3. 修改 `id`、名称、头像、简介、`format` 和风格。只调整队伍成员、道具、特性、努力值、性格、招式或太晶属性时，直接编辑 `team`。
4. 在服务端仓库执行下面的校验命令。出现错误时按输出修改；不合法的训练家会停用，不会被随机队伍替换。

```powershell
Set-Location F:\fantasy\pokemon-showdown
npm run validate:fantasy-ai
```

5. 停止旧服务，再执行 `npm start`（或 `node .\pokemon-showdown`）。刷新客户端 AI 挑战页，选择对应赛制即可看到训练家。队伍配置在启动时加载，单独刷新网页不会重新加载服务端配置。

服务端优先读取 `config/fantasy-ai-trainers.ts`：只有数组为空、AI 已开启且 `allowDevelopmentTrainers` 为 `true` 时，才回退到 `config/fantasy-ai-trainers.example.json` 的三个开发样例；非空但配置错误时不会回退掩盖问题。按用户最新要求，本机实际 `config/config.js` 已开启这两个开关，默认 8000 服务即可进行 AI 挑战。

## 完整可复制示例

下面是一套通过当前 FC UU 校验的配置示例，用来展示编辑格式。复制到 `config/fantasy-ai-trainers.ts` 后，可以把整个 `team` 替换为你自己的队伍。正式训练家内容由你决定。

```typescript
import type { TrainerDefinition } from '../server/fantasy-ai/types';

export const Trainers: TrainerDefinition[] = [
	{
		id: 'my-uu-trainer',
		name: '我的 UU 训练家',
		avatar: '1',
		description: '使用固定队伍进行 FC UU 挑战。',
		format: 'gen9fcuu',
		style: 'balanced',
		keyMembers: [6],
		resourcePreferences: ['terastallize'],
		team: `Mew @ Leftovers
Ability: Synchronize
EVs: 252 HP / 4 SpA / 252 Spe
Timid Nature
- Psychic
- Roost
- Will-O-Wisp
- Stealth Rock

Hippowdon @ Leftovers
Ability: Sand Stream
EVs: 252 HP / 252 Def / 4 SpD
Impish Nature
- Earthquake
- Slack Off
- Stealth Rock
- Whirlwind

Scizor @ Heavy-Duty Boots
Ability: Technician
EVs: 248 HP / 252 Atk / 8 SpD
Adamant Nature
- Bullet Punch
- U-turn
- Roost
- Defog

Rotom-Wash @ Leftovers
Ability: Levitate
EVs: 252 HP / 200 Def / 56 Spe
Bold Nature
- Hydro Pump
- Volt Switch
- Will-O-Wisp
- Pain Split

Clefable @ Leftovers
Ability: Magic Guard
EVs: 252 HP / 252 Def / 4 SpD
Bold Nature
- Moonblast
- Soft-Boiled
- Calm Mind
- Thunder Wave

Excadrill @ Leftovers
Ability: Mold Breaker
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Iron Head
- Rapid Spin
- Swords Dance`,
	},
];
```

`team` 中每只宝可梦之间保留一个空行。可以在队伍文本里设置 `Tera Type: ...`、`IVs: ...`、`Level: ...` 等正常导入字段；每只必须有一至四个招式，整队必须恰好六只，所有配置仍须符合所选赛制。

## 字段说明

| 字段 | 用途 |
|---|---|
| `id` | 唯一标识：以小写字母开头，只含小写字母、数字和连字符，最多 40 字符。重复标识会使冲突配置全部停用。 |
| `name` | 界面显示名称，最多 60 字符。 |
| `avatar` | 客户端已有头像标识，例如 `'1'`；不能填写图片网址或文件路径。 |
| `description` | 界面显示的纯文本简介，最多 500 字符。 |
| `format` | 上表三个引擎赛制 ID 之一；控制 AI 队伍校验、玩家队伍校验及实际对战规则。 |
| `team` | 完整六只队伍的 Showdown 导入文本。 |
| `style` | `'balanced'` 均衡、`'aggressive'` 强攻、`'defensive'` 稳健。 |
| `keyMembers` | 可省略；AI 需要重视的原队伍位置，从 1 开始，例如 `[1, 6]`。会提高对换入承伤的顾虑，以及钉子使关键成员濒死或无法入场时的清钉收益。修改队伍顺序时同步检查。 |
| `resourcePreferences` | 可省略；`'mega'`、`'zmove'`、`'terastallize'`、`'aura'` 中的偏好列表，可同时填写四项。需配好对应宝可梦与道具；Z／气场仍共用次数，不会赋予赛制禁止的能力。 |
| `developmentOnly` | 正式配置通常省略；设为 `true` 的项目仅在显式允许开发训练家的环境显示。 |

需要多个赛制或多名训练家时，在数组内继续添加对象即可。不同赛制下的队伍不共享修改：每个对象的 `team` 都是该项独立的固定配置。当前页面不会在开战前公开 AI 的六只成员及详细配招。

开发样例的校验命令是 `npm run validate:fantasy-ai:examples`。原有策略回归用的固定 AG 样例已经独立放在 `test/fixtures/fantasy-ai-trainers.json`；修改它不会更改网页使用的 AI 队伍。不要为了让不合法的新队伍通过而更改该测试基准。

玩家正常操作与完整本机启动步骤见 [AI-FANTASY-LOCAL.md](AI-FANTASY-LOCAL.md)。

## 撒钉与清钉策略的开发入口

给训练家的队伍配置隐形岩、撒菱、毒菱、黏黏网，以及高速旋转、晶光转转、除雾、大扫除或换场等招式后，AI 会把它们纳入现有合法行动评分，无须另外添加固定回合脚本。普通与高难共用同一套逻辑，区别仍只有可用信息。

- `server/fantasy-ai/hazards.ts`：共享的钉子收益估算，附有多行开发注释。按剩余队伍、属性、道具、特性、血量、关键成员、近期换人和轮转招式估算收益；毒菱额外考虑毒系吸收及异常获益，黏黏网考虑速度线和能力下降免疫。对方只剩一只且已经在场时，不再给撒钉奖励。
- `server/fantasy-ai/matchup.ts`：记录原生单招执行前后双方钉子的实际变化，判断叠层、清钉、反射及无效招式，不仅按招式名称推断成功。
- `server/fantasy-ai/policy.ts`：将清钉收益与当前承伤、能否先手出招、直接击杀等选择比较。保留有净收益的清钉、撒钉候选，避免在推演前被特殊机制变体挤掉；除雾、大扫除和换场同时计算双方的得失。
- `server/fantasy-ai/rollout.ts`：一回合推演使用同一钉子估值，按实际假想回合结果比较撒钉、清钉和其他行动。

这些权重属于启发式策略，未承诺固定回合清钉或多回合最优解。普通档无法确定的对手道具、特性等仍使用公开记录及配置假设；复杂自定义入场效果与隐藏计数器仍受现有局面还原边界限制。此扩展按用户要求未运行测试，实际表现由用户自行确认。
