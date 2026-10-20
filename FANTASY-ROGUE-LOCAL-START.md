# 本地幻想杯肉鸽：构建、启动与重启

## 推荐操作

在 PowerShell 中运行：

```powershell
Set-Location F:\fantasy\pokemon-showdown
.\tools\restart-fantasy-rogue-local.ps1
```

这个脚本会：

1. 使用旁边的本地服务端源码完整构建客户端和服务端，跳过 GitHub 数据同步。
2. 检查活动对战，备份预览库、普通肉鸽库及本地配置。
3. 只停止它能确认来源的本地预览进程和对应工作进程，不关闭其他 Node 程序。
4. 在 127.0.0.1:8000 后台启动新版，并通过真实 WebSocket 确认图鉴与当前源码版本一致。
5. 输出启动日志位置；备份放在 `databases/backups/local-restart-*`，最近一次备份位置记录于 `tmp/fantasy-rogue-last-backup.json`。

之后打开原来的客户端页面，按 **Ctrl+F5** 强制刷新。再使用以前保存冒险时的**同一个固定测试昵称**，点击“刷新存档”。未选择昵称时，图鉴可以预览，但队伍面板不会读到个人冒险。

本地文件入口为：

```text
F:\fantasy\pokemon-showdown-client\play.pokemonshowdown.com\testclient.html?~~localhost:8000#fantasyrogue
```

脚本使用本地已有代码，不自动执行 Git 更新。远端有新提交时，先在对应的两个仓库同步代码，再执行重启脚本。当前本机代码已经同步；GitHub 无法连接时，也能构建并启动已有的本地版本。

若 8000 端口被其他启动方式占用，脚本会拒绝关闭未知进程。请先到原来启动服务的 PowerShell 窗口按 Ctrl+C，再运行脚本；只关闭网页或重新打开网页不会结束服务器进程。

## 手动操作时的区别

- `node build`、`node build full` 只构建文件，不会替换已经运行中的服务进程。
- 客户端在 `F:\fantasy\pokemon-showdown-client` 构建：`node build full --local-server ..\pokemon-showdown`。
- 服务端在 `F:\fantasy\pokemon-showdown` 启动：`npm run start:fantasy-rogue:local`。先停止旧服务，避免两个进程争用 8000 端口。这个命令会构建服务端并在当前终端持续运行；该终端按 Ctrl+C 即停止。
- 使用普通启动命令时，不建议跳过构建后直接沿用旧进程；重新构建后必须真正停止并重新启动一次。
- 缺少 PHP 的提示只影响可选新闻抓取；以脚本最终退出码和实际启动／版本检查为准。

## 2026-10-20 实际完成记录

重启前发现 8000 端口仍由 10 月 19 日启动的 `node .\pokemon-showdown start --skip-build` 进程占用。它返回旧版 184 条祝福，未包含新版图鉴协议；重新构建或刷新网页都不会改变这个进程已加载的代码。

确认无肉鸽战斗后完成在线备份，停止已核实的旧服务和所属工作进程，以当前肉鸽源码重新构建、启动。新服务返回图鉴协议 2、版本指纹 `6958db80b1d5bd1d`、188 条祝福、96 段奇遇、89 位人物。

启动后、读取个人存档前，两库全部 19 个账号的保存数据与备份逐字一致。随后通过真实 WebSocket 恢复已有第 1 层冒险，核对队伍、招式、HP、PP、金币、背包、点数、局外加点与捕获记录不变；重复读取不改变存档版本。该账号允许正常补记兼容字段，其余 18 个账号仍逐字一致。

此次备份：`databases/backups/local-restart-2026-10-20T09-50-21-710Z`。验证结果保存在本机忽略的 `tmp/local-restart-save-result.json`；日志保存在 `tmp/rogue-local-20261020-175022.log`。
