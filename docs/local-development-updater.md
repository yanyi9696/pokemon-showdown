# Windows 本地 Pokémon Showdown 更新工具

`更新并重启本地肉鸽.cmd` 现在是通用的本地更新入口，覆盖服务端规则、宝可梦数据、Rogue、客户端界面及回放页面。名称保留以兼容现有使用习惯。

## 熟悉的 PowerShell 启动方式

本机仍可直接运行：

```powershell
cd F:\fantasy\pokemon-showdown
node .\pokemon-showdown
```

等终端显示“游戏已就绪”，打开 `http://localhost:8080/testclient.html#fantasyrogue`。保留窗口，按 Ctrl+C 同时停止对战和网页服务。8000 是对战端口，8080 是同次启动的客户端页面，不需要另开网页服务或先运行 cmd。重复执行时，若已有同一版本服务，会提示入口并退出，不重复启动；已有不同版本时提示先在原窗口停止。

`pokemon-showdown` 保留可选的 Windows 启动转接：仅在 Windows 启动游戏服务器、且仓库上一级已安装 `launch-local-development.cjs` 时调用它。本机对应 `F:\fantasy\launch-local-development.cjs`，再以 `-Foreground -NoOpen` 使用同一套构建、备份和进程验证。未安装转接文件的 Windows 工作区，以及 Linux/macOS，均使用原生 CLI；帮助、回放等其他子命令也保持原样。桥接逻辑随开发分支发布，机器专用的转接文件、配置和存档不入 Git。原文件备份仍保留在 `local-development-state/checks/manual-start-20261024/pokemon-showdown.before`。`更新并重启本地肉鸽.cmd` 仍是可选的后台更新工具。

固定 HTTP 来源继续保留已有浏览器昵称与偏好；不读取或使用 testclient-key.js，不需要复制登录验证。仅有网页快捷方式不会启动服务，必须先启动上述命令或可选更新工具。

## 实际源码与运行目录

当前 `F:\fantasy\release-audit-20261022\server` 和 `client` 是两个仓库登记的 Git worktree，检出 `codex/fantasy-rogue`。它们不是冻结的发布副本。原 `pokemon-showdown` 和 `pokemon-showdown-client` 目录分别保留 master、fantasy 分支；直接运行它们的旧构建不会包含最新 Rogue 功能。本机 `local-development.json` 的 `serverSource` / `clientSource` 明确选择上述开发工作区；未设置时才按分支发现目录。

服务端直接编译所选工作区到其 `dist`，客户端直接在所选工作区生成测试页面与静态资源；客户端数据生成显式使用同一次更新选中的服务端。运行进程通过启动记录加载同一份 `dist`。不复制或同步源码，不操作其他工作区的源码，不执行 Git 拉取、切换、重置或清理。

默认更新当前 Rogue 开发工作区，包括其中的普通对战改动。如果普通对战开发在另一个工作区进行，必须选择那个工作区；工具不会自动把不同分支合并。自动选择时，如果其他工作区存在未提交内容，会中止并列出目录，避免漏用修改。选择明确的目录后允许该目录有未提交内容。

## 使用

双击原 cmd 即可更新默认工作区。需要指定源码时，在 PowerShell 中运行：

```powershell
& F:\fantasy\launch-local-development.ps1 -ServerRoot F:\fantasy\pokemon-showdown -ClientRoot F:\fantasy\pokemon-showdown-client
```

上述目录只是选择示例，不会切换其中的分支。长期更换默认来源，可以修改 `local-development.json` 的 `serverSource` / `clientSource`；删除这两项后，改由 `serverBranch` / `clientBranch` 发现已检出的工作区。显式命令参数优先于配置。工具代码始终从 `toolsBranch` 所指工作区读取。

```powershell
# 只核对目录、Git 状态、存档路径和构建计划，不备份、不构建、不重启
& F:\fantasy\launch-local-development.ps1 -CheckOnly
# 强制重新构建两端（例如手动升级 node_modules 后）
& F:\fantasy\launch-local-development.ps1 -Rebuild
# 更新成功后不自动打开浏览器（例如自动回归验证时）
& F:\fantasy\launch-local-development.ps1 -NoOpen
```

两个源码目录都必须已安装依赖，服务端配置须使用回环地址、8000 端口、`noguestsecurity=true` 及配置文件指定的原存档路径。工具不会替用户覆盖配置。当前主存档仍为 `F:\fantasy\pokemon-showdown\databases\fantasy-rogue-preview.db`，原固定测试昵称不变。

## 本地测试昵称登录

快捷方式和更新后自动打开的地址固定为 `http://localhost:8080/testclient.html`（肉鸽入口追加 `#fantasyrogue`）。同一个 Windows 开发进程只在 `127.0.0.1:8080` 提供本次构建的客户端，战斗服务仍在 `127.0.0.1:8000`。入口不依赖 Windows 对 `file://` 查询参数的处理，也不会因更换工作区而改变浏览器存储来源。

第一次打开新目录的页面时，在右上角输入**原来的测试昵称**即可读取同一账号的本地存档；不需要密码或手动复制验证内容。服务器接受昵称后，客户端将它保存在该页面的本地偏好中，刷新和重连会自动恢复。主动退出登录才清除记住的昵称。不会替用户选择或改名，也不迁移、合并或改写存档。

本地模式使用服务器原有的 `/trn` 未注册昵称流程，不加载 `testclient-key.js`，不访问正式账号的 SID 或 Cookie。服务器仍拒绝无凭据使用受信任账号。普通网站、远程服务器和未启用本地模式的测试入口仍执行原有登录流程。旧入口的本地配置不复制到新目录，浏览器安全设置不变。

启动程序在读取 Config 前恢复旧预览器的 `FANTASY_AI_LOCAL=1` 进程预设，让服务端及子进程使用本地开发模式。Rogue 原有权限检查同时要求该服务端标志和回环监听，普通测试昵称即可进入；远端客户端伪造参数不能取消生产白名单。启动程序还只在此 Windows 回环运行实例关闭聊天消息节流，防止启动界面的批量查询挤满队列、丢弃紧随其后的昵称恢复命令。生产配置及权限源文件不修改。

HTTP 服务仅开放构建资源，动态生成不含凭据的本地配置，拒绝跨站 Origin、非 localhost Host、目录越界、源码、source map、数据库和 key 文件访问。它不代理正式登录。若 8080 被未知程序占用，更新器中止并说明错误，不结束该程序。

## 构建与成功判定

1. 读取已跟踪、未提交和未忽略的新文件，以及本地构建配置，计算内容指纹。Git 提交号只用于显示来源，不替代内容比较。
2. 检查本地服务和进行中的对战，先备份配置与 SQLite 数据库（包括 WAL 中的数据）。其他活跃普通数据库也备份，既有历史备份不再重复备份。
3. 仅停止能确认来源的本地游戏进程及其 Node 子进程。其他端口所有者、进行中的战斗或重复运行的更新器会导致中止。
4. 内容或产物变化时，保存旧 `dist` 到本次记录目录，再执行服务端 `node build`、客户端 `node build full --local-server <所选服务端>` 和独立 `node build replays`。这不会把已经废弃的旧 dist 模块混入新版本。状态目录须与服务端位于同一磁盘，且在源码目录之外。
5. 只有源码与产物均和上次成功记录相同才复用构建；依赖版本变化也必须重建，手动修改依赖内容后可用 `-Rebuild`。
6. 启动时再次比较文件指纹，以本次随机标识、进程号和产物指纹核验启动记录，并核对 HTTP 页面与战斗服务属于同一次构建。检查普通 Showdown 格式列表、房间协议、启动查询突发后的免凭据昵称登录及 Rogue 访问权限。登录检查使用临时未注册昵称，不打开玩家存档。不会仅靠“8000 能连接”或 Rogue 图鉴条数判断成功。
7. 成功后显示两端绝对路径、分支、完整 SHA、有无未提交修改、构建结果、备份目录和端口。生成通用开发版及肉鸽开发版快捷方式，并自动打开本次实际构建的客户端；`-NoOpen` 可关闭自动打开。浏览器关联失败单独提示，不把已验证的服务停止。旧目录的标签不会变成新版本，应关闭旧标签。构建失败时不会打开客户端。

构建日志、备份、启动记录保存在 `local-development-state\runs\<本次目录>`；`last-success.json` 只记录最后一次完全通过检查的更新。失败会以非零退出码结束。构建失败后服务保持停止，不自动用旧版本冒充更新成功；可据日志修复后重新运行。旧源码、配置、数据库不会被回滚或替换。工具不自动清理备份，可定期人工归档。

可选 PHP 公告生成失败时，客户端会使用已有的本地公告回退；构建日志保留此提示。这与必要的 JS、数据、页面构建失败分别报告。

## 安装文件

仓库中 `tools/launch-local-development.ps1` 是小型引导器，复制到两个仓库的父目录。将 `tools/update-local-development.cmd` 复制为原 cmd 名，将 `tools/local-development.example.json` 复制为 `local-development.json` 后按本机目录调整。现有入口和配置应先备份；不覆盖已定制的配置。

该工具只支持 Windows 本地环境，无 SSH、远端部署或服务发布步骤。回归测试：

```text
node node_modules/mocha/bin/mocha.js --no-config test/server/local-development.js test/server/fantasy-rogue-local-maintenance.js --exit
```
