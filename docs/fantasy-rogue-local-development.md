# 本地开发版试玩

Windows 本地更新现已统一到 [本地开发更新工具](local-development-updater.md)。原 `更新并重启本地肉鸽.cmd` 名称继续使用，但默认通过 Git worktree 发现当前开发源码，覆盖普通 PS 与 Rogue。以下专用脚本记录保留用于历史操作说明。

网页文件、服务进程和存档是三个独立部分。Git 更新代码或重新构建不会让已运行的 Node 进程重新加载。图鉴条目由服务端提供：若本地仍显示旧数量，应检查实际占用 8000 端口的进程，而不是清空存档。

在服务端开发工作区运行（路径替换为对应客户端开发工作区）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\restart-fantasy-rogue-local.ps1 -ClientRoot "F:\fantasy\release-audit-20261022\client" -StartMode normal -Port 8000
```

`normal` 使用当前工作区 `config/config.js` 的配置，要求绑定本机回环地址。`preview` 使用本工作区独立的 `databases/fantasy-rogue-preview.db`。不要随意切换模式，否则看到的可能是另一份存档。

跨工作区继续原存档时，将未提交的本地配置 `fantasyrogue.database` 指向原存档的绝对路径；不需要复制、覆盖或删除数据库。备份工具会同时备份标准位置和配置指定的数据库，使用 SQLite 备份 API 包含 WAL 中的最新数据。

脚本先构建指定的客户端及配套服务端、检查活动对战、备份存档，再重启当前工作区的服务；最后核对运行服务与磁盘构建的图鉴版本及条目数。若端口由其他目录或不明进程占用，脚本会停止，不会自动终止它。

启动成功后，打开脚本打印的 `testclient.html?~~localhost:8000#fantasyrogue` 地址，并按 Ctrl+F5。使用原来的固定测试昵称继续存档。旧正式分支目录中的网页不会自动换成开发版网页。

这些操作仅用于本地开发，不合并正式分支，也不执行生产部署。
