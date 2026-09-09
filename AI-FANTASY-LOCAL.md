# Fantasy AI 本机开发与验收

本机入口是正常客户端的 [http://localhost:8080/](http://localhost:8080/)，「AI 挑战」位于「队伍编辑器」下方，支持对战前选择 FC UBUU、FC OU、FC UU。按用户最新要求，实际 `config/config.js` 已开启 AI，常规服务使用 8000 端口。当前正式训练家为「阿塞萝拉」，本轮在已有 FC OU 队伍之外补充用户提供的 FC UBUU 和 FC UU 队伍；正式配置非空时不再自动显示三个开发样例。自定义训练家与队伍见 [AI-FANTASY-TEAMS.md](AI-FANTASY-TEAMS.md)。

## 启动

在两个 PowerShell 终端分别运行（首次使用须先按两个仓库各自的说明安装依赖）：

```powershell
Set-Location F:\fantasy\pokemon-showdown
npm start
```

```powershell
Set-Location F:\fantasy\pokemon-showdown-client
npm run start:local
```

服务端沿用 8000，客户端网页使用 8080 并连接 8000。直接执行 `node .\pokemon-showdown` 也会读取相同配置并开启 AI。两者都复用正常构建，改动代码后重新构建并重启相应进程。关闭终端中的服务可按 Ctrl+C。

实际 `config/config.js` 中的配置为：

```javascript
exports.fantasyai = {
    enabled: true,
    allowDevelopmentTrainers: true,
    maxBattles: 2,
    maxBattlesPerPlayer: 1,
    decisionMs: 10000, // 常规总预算，含排队；0 立即兜底，null 手动不限时
    criticalDecisionMs: 20000, // 关键决策的总上限，不是额外追加 20 秒
    criticalDecisionLimit: 2, // 每局最多分配两次
    criticalDecisionCooldownTurns: 10, // 两次至少间隔十回合
    disconnectMs: 10 * 60 * 1000,
};
```

当前常规决策最多 10 秒；从第 10 回合起，残局资源选择、低血量收割或残兵面对公开强化威胁，才可能分配一次 20 秒关键额度，每局最多两次且间隔至少十回合。同一次决策重试不刷新时间；提前完成便提前出招。常规搜索最多四回合，关键最多六回合，截止时使用已完成结果。配置含义、取消与算法边界见 [AI-FANTASY-TIME-BUDGET.md](AI-FANTASY-TIME-BUDGET.md)。

训练家优先读取 `config/fantasy-ai-trainers.ts`；数组为空且允许开发训练家时才加载开发样例。需要仅监听回环地址时仍可使用 `npm run start:fantasy-ai:local`，同样使用 8000。8000 上只能运行一个服务，更新时重启原服务；不再使用额外的 8001 服务或端口环境变量。

客户端通过原有用户名与登录界面访问真正的身份服务。本地服务仅将 `/~~localhost/action.php` 透传到 `https://play.pokemonshowdown.com`，不生成身份断言、不替换登录函数、不记录登录请求内容；缺失的图片与音频资源也使用官方资源地址。因此本机游玩仍需要网络访问身份服务及外部资源。PHP 新闻生成器缺失时仅显示无法读取新闻的提示，不影响客户端构建与对战。

## 更新线上服务器后开启 AI

`config/config.js` 是每台服务器独立维护的运行配置，被 Git 忽略。本机的 `enabled: true` 不会随 `git pull` 同步到线上；线上没有配置 `fantasyai` 时，仍使用 `config/config-example.js` 中的默认值 `enabled: false`。客户端收到服务端的 `enabled: false` 才显示「AI 挑战尚未开放」，这与玩家是否已经选择用户名无关。

在**线上实际运行的服务端目录**中，先检查 AI 配置：

```sh
node -e "console.log(require('./config/config.js').fantasyai)"
```

如果输出为 `undefined` 或 `enabled: false`，在该服务器的 `config/config.js` 末尾加入以下配置；已有 AI 配置时也可以直接修改其中的开关。这里保留已有的并发和时间预算设置，只启用正式训练家：

```javascript
exports.fantasyai = {
    ...exports.fantasyai,
    enabled: true,
    allowDevelopmentTrainers: false,
};
```

保留线上原有的其余配置，不要用本机 `config/config.js` 或示例文件整份覆盖。正式训练家读取随仓库更新的 `config/fantasy-ai-trainers.ts`，当前包含阿塞萝拉的 FC UBUU、FC OU、FC UU 三支队伍，不需要启用开发样例。

更新服务端代码后，在同一目录运行构建和正式队伍校验：

```sh
npm run validate:fantasy-ai
```

校验通过后，使用线上原有的进程管理方式**重启正在提供服务的 Pokémon Showdown 服务端进程**，然后在 AI 挑战页点击「刷新 / 查询结果」。AI 管理器在首次使用时缓存配置，仅刷新网页、热更新配置或重启客户端静态站点不会替换该实例。线上继续使用原来的启动方式；`start:fantasy-ai:local` 会强制回环监听和本机身份服务配置，仅供本机开发使用。

如重启后仍显示「尚未开放」，检查被重启进程的运行目录，以及客户端连接的服务端是否正是本次修改的实例。管理员可在该服务端使用 `/fantasyai status` 查看当前 `enabled` 和训练家 `diagnostics`。如果提示变为「目前没有可挑战的 AI 训练家」，说明开关已经生效，应检查正式队伍校验输出和训练家诊断。

## 玩家操作

1. 打开首页，按正常流程选择用户名或登录，然后进入「AI 挑战」。
2. 先选择 FC UBUU / FC OU / FC UU，再选择该赛制的训练家和难度。首次难度默认为普通，高难说明直接显示在选项下。
3. 通过「打开队伍编辑器」创建或导入自己的六只队伍，返回选择该队伍；没有自动赠送或代选的队伍。
4. 点击「开始挑战」。服务器确认训练家属于所选赛制，并按该赛制验证队伍；失败时在页面显示原因并保留选择。
5. 进入正常战斗页面后选择首发、招式或换人。存在未结束的 AI 对局时，选择页提供「返回已有对局」。
6. 认输或结束后，可使用现有回放入口。「重新挑战」只回到选择页，恢复该局的赛制、训练家、难度和队伍，仍需手动开始下一局。

选择保存在当前浏览器偏好中，按服务器地址和玩家身份区分。队伍编辑和排序会保持关联；删除或无法唯一对应的队伍需要重新选择。未注册昵称刷新页面后可能需要按正常身份流程重新选择同一昵称，才能恢复该身份的选择和对局。断线默认保留十分钟，期间不会替玩家出招。

## 开发验证

服务端：

```powershell
npm run test:fantasy-ai -- test/sim/misc/state.js test/server/room-battle.js test/server/rooms.js test/server/users.js test/server/ladders.js
```

客户端：

```powershell
npm run build
node node_modules/mocha/bin/mocha.js test/fantasy-ai.test.js
```

完整验证范围、已有全仓类型检查限制和待完成事项见 [AI-FANTASY-PROGRESS.md](AI-FANTASY-PROGRESS.md)。自动化测试不能替代设计文档要求的完整浏览器验收，也不能证明策略强度达标。

最新策略及 `searchDepths` / `fallbackReasons` 统计说明见 [AI-FANTASY-STRATEGY.md](AI-FANTASY-STRATEGY.md)。策略代码更新后重启原有 8000 服务并重新开始挑战；同一端口只能启动一个进程。
