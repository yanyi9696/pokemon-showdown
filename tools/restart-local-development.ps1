param(
    [Parameter(Mandatory = $true)][string]$SettingsFile,
    [string]$ServerRoot,
    [string]$ClientRoot,
    [switch]$Rebuild,
    [switch]$CheckOnly
)
# UTF-8 BOM is required when distributing this file to Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$helper = Join-Path $PSScriptRoot 'local-development.js'
$recordFile = $null
$started = $null
$lock = $null
$stopped = $false

function Read-Json([string]$File) {
    return Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
}
function Invoke-Helper([string[]]$Arguments) {
    & $nodeExecutable $helper @Arguments
    if ($LASTEXITCODE -ne 0) { throw "本地更新步骤失败：$($Arguments[0])（退出码 $LASTEXITCODE）" }
}
function Test-CommandPath([string]$Command, [string]$File) {
    $normalized = $Command.Replace('/', '\')
    return $normalized -match ('(?:^|\s)(?:"' + [regex]::Escape($File) + '"|' + [regex]::Escape($File) + ')(?:\s|$)')
}
function Get-GameProcess {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)
    if (!$listeners.Count) { return $null }
    if (@($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count) {
        throw '8000 端口未限制在本机回环地址，停止自动操作。'
    }
    $owners = @($listeners.OwningProcess | Sort-Object -Unique)
    if ($owners.Count -ne 1) { throw '8000 端口存在多个所有者，停止自动操作。' }
    $service = Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
    foreach ($root in $record.allowedServerRoots) {
        if (Test-CommandPath $service.CommandLine (Join-Path $root 'dist\server\sockets.js')) {
            $service = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.ParentProcessId)"
            break
        }
    }
    if (!$service -or $service.Name -ne 'node.exe') { throw '8000 端口被非游戏进程占用。' }
    foreach ($root in $record.allowedServerRoots) {
        $cli = Join-Path $root 'pokemon-showdown'
        if (Test-CommandPath $service.CommandLine $cli) { return $service }
    }
    # Managed runtimes must identify a receipt inside this profile, with the same PID.
    if ($service.CommandLine -match '"([^"\r\n]+local-development-runtime\.js)"\s+"([^"\r\n]+update\.json)"\s*$') {
        $runtime = $Matches[1]
        $receiptFile = [IO.Path]::GetFullPath($Matches[2])
        $runsPrefix = [IO.Path]::GetFullPath((Join-Path $record.settings.stateRoot 'runs')).TrimEnd('\') + '\'
        if ($receiptFile.StartsWith($runsPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $receiptFile)) {
            $receipt = Read-Json $receiptFile
            $readyFile = Join-Path (Split-Path $receiptFile -Parent) 'runtime-ready.json'
            if ($receipt.runtimeScript -eq $runtime -and (Test-Path -LiteralPath $readyFile)) {
                $ready = Read-Json $readyFile
                if ($ready.pid -eq $service.ProcessId -and $ready.id -eq $receipt.id) { return $service }
            }
        }
    }
    throw '8000 端口不是可确认来源的本地游戏进程。请在原窗口关闭它后重试；工具不会关闭未知进程。'
}
function Stop-GameTree($Service) {
    $all = @(Get-CimInstance Win32_Process)
    $descendants = @()
    $frontier = @($Service.ProcessId)
    while ($frontier.Count) {
        $children = @($all | Where-Object { $_.ParentProcessId -in $frontier -and $_.ProcessId -notin @($descendants.ProcessId) })
        $frontier = @($children | ForEach-Object { $_.ProcessId })
        $descendants += $children
    }
    foreach ($child in $descendants) {
        # Windows attaches a console host to hidden Node processes; it exits with the console.
        if ($child.Name -eq 'conhost.exe' -and $child.ExecutablePath -eq (Join-Path $env:SystemRoot 'System32\conhost.exe')) { continue }
        $known = $false
        foreach ($root in $record.allowedServerRoots) {
            if ($child.Name -eq 'node.exe' -and $child.CommandLine.Replace('/', '\').Contains((Join-Path $root 'dist\'))) { $known = $true }
        }
        if (!$known) { throw "子进程 $($child.ProcessId) 来源无法确认，停止自动重启。" }
    }
    $fresh = Get-CimInstance Win32_Process -Filter "ProcessId = $($Service.ProcessId)"
    if (!$fresh -or $fresh.CreationDate -ne $Service.CreationDate) { throw '服务进程已变化，停止自动重启。' }
    Stop-Process -Id $Service.ProcessId -ErrorAction Stop
    foreach ($child in @($descendants | Where-Object Name -eq 'node.exe')) {
        $fresh = Get-CimInstance Win32_Process -Filter "ProcessId = $($child.ProcessId)"
        if ($fresh -and $fresh.CreationDate -eq $child.CreationDate) { Stop-Process -Id $child.ProcessId -ErrorAction Stop }
    }
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (!(Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 250
    }
    throw '旧进程停止后端口仍未释放。'
}

try {
    $SettingsFile = (Resolve-Path -LiteralPath $SettingsFile).Path
    $settings = Read-Json $SettingsFile
    $stateRoot = $settings.stateRoot
    if (!$stateRoot -or $stateRoot -match '^(\\\\|//|\w+://)') { throw '状态目录必须是 Windows 本地路径。' }
    if (![IO.Path]::IsPathRooted($stateRoot)) { $stateRoot = Join-Path (Split-Path $SettingsFile -Parent) $stateRoot }
    $stateRoot = [IO.Path]::GetFullPath($stateRoot)
    [IO.Directory]::CreateDirectory($stateRoot) | Out-Null
    try { $lock = [IO.File]::Open((Join-Path $stateRoot 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw '已有更新工具在运行，或状态目录不可写。请勿同时执行两次更新。' }
    # Sentinel arguments survive Windows PowerShell 5.1's omission of empty native arguments.
    $serverArgument = if ($ServerRoot) { $ServerRoot } else { '-' }
    $clientArgument = if ($ClientRoot) { $ClientRoot } else { '-' }
    $modeArgument = if ($Rebuild) { 'force' } else { 'auto' }
    $prepared = @(Invoke-Helper @('prepare', $SettingsFile, $serverArgument, $clientArgument, $modeArgument))
    $recordFile = [string]$prepared[-1]
    $record = Read-Json $recordFile
    Write-Host "服务端：$($record.sources.server.root)"
    Write-Host "  $($record.sources.server.branch) @ $($record.sources.server.commit)；含未提交修改：$($record.sources.server.dirty)"
    Write-Host "客户端：$($record.sources.client.root)"
    Write-Host "  $($record.sources.client.branch) @ $($record.sources.client.commit)；含未提交修改：$($record.sources.client.dirty)"
    Write-Host "构建计划：$($record.plan.reason)"
    Write-Host "存档：$($record.settings.saveDatabase)；端口：127.0.0.1:8000"
    if ($CheckOnly) {
        Write-Host '只检查已完成，没有备份、构建或重启。'
    } else {
        $service = Get-GameProcess
        if ($service) { Invoke-Helper @('inspect') }
        Invoke-Helper @('backup', $recordFile)
        $current = Get-GameProcess
        if (($service -and (!$current -or $current.ProcessId -ne $service.ProcessId -or $current.CreationDate -ne $service.CreationDate)) -or (!$service -and $current)) {
            throw '备份期间服务进程发生变化，停止自动重启。'
        }
        if ($current) {
            Invoke-Helper @('inspect')
            Stop-GameTree $current
            $stopped = $true
        }
        Write-Host '备份已完成。正在验证或构建服务端、客户端，请等待日志结果。'
        Invoke-Helper @('build', $recordFile)
        $record = Read-Json $recordFile
        $outputLog = Join-Path $record.directory 'runtime.log'
        $errorLog = Join-Path $record.directory 'runtime.err'
        if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) { throw '构建期间 8000 端口被其他进程占用。' }
        $launchArguments = @(('"' + $record.runtimeScript + '"'), ('"' + $recordFile + '"'))
        $started = Start-Process -FilePath $nodeExecutable -ArgumentList $launchArguments -WindowStyle Hidden -PassThru `
            -WorkingDirectory $record.sources.server.root -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
        $ready = $false
        for ($attempt = 0; $attempt -lt 120; $attempt++) {
            Start-Sleep -Milliseconds 500
            $started.Refresh()
            if ($started.HasExited) { throw "启动失败，查看 $errorLog" }
            if (!(Test-Path -LiteralPath (Join-Path $record.directory 'runtime-ready.json'))) { continue }
            $running = Get-GameProcess
            if ($running -and $running.ProcessId -eq $started.Id) { $ready = $true; break }
        }
        if (!$ready) { throw "启动超时，查看 $errorLog 和 $outputLog" }
        Invoke-Helper @('finish', $recordFile, [string]$started.Id)
        Write-Host '更新并重启成功：已核对本次源码、构建指纹、启动进程及普通对战协议。' -ForegroundColor Green
        Write-Host '请使用上面显示的客户端入口或本地开发版快捷方式，浏览器按 Ctrl+F5。原测试昵称和存档保持不变。'
    }
} catch {
    $failure = $_.Exception.Message
    if ($started) {
        try {
            $newService = Get-CimInstance Win32_Process -Filter "ProcessId = $($started.Id)"
            if ($newService -and (Test-CommandPath $newService.CommandLine $recordFile)) { Stop-GameTree $newService }
        } catch { Write-Host "新进程清理未完成：$($_.Exception.Message)" -ForegroundColor Red }
    }
    if ($recordFile -and (Test-Path -LiteralPath $recordFile)) {
        & $nodeExecutable $helper fail $recordFile ([string]$failure)
    }
    Write-Host "更新失败：$failure" -ForegroundColor Red
    if ($stopped) { Write-Host '旧服务已停止；没有将旧构建回退启动冒充更新成功。修复日志中的错误后重新运行。' }
    if ($started) { Write-Host '新进程未通过全部检查；请查看本次 runtime.log / runtime.err，不能视为更新成功。' }
    if ($recordFile) { Write-Host "本次检查、备份和构建日志目录：$(Split-Path $recordFile -Parent)" }
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
exit 0
