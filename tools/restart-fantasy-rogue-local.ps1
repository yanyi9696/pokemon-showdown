param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [string]$ClientRoot,
    [ValidateSet('auto', 'normal', 'preview')][string]$StartMode = 'auto'
)
# Keep the UTF-8 BOM so Windows PowerShell 5.1 can read Chinese strings.
$ErrorActionPreference = 'Stop'
$serverRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$ClientRoot) {
    $ClientRoot = Join-Path (Split-Path $serverRoot -Parent) 'pokemon-showdown-client'
}
$clientRoot = (Resolve-Path -LiteralPath $ClientRoot -ErrorAction Stop).Path
if (!(Test-Path -LiteralPath (Join-Path $clientRoot 'play.pokemonshowdown.com\testclient.template.html'))) {
    throw 'ClientRoot 不是有效的客户端源码目录。'
}
$previewScript = Join-Path $PSScriptRoot 'fantasy-rogue-preview.js'
$serverCli = Join-Path $serverRoot 'pokemon-showdown'
$maintenanceScript = Join-Path $PSScriptRoot 'fantasy-rogue-local-service.js'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source

function Get-GameProcess {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if (!$listeners.Count) { return $null }
    $owners = @($listeners.OwningProcess | Sort-Object -Unique)
    if ($owners.Count -ne 1) { throw "端口 $Port 有多个所有者，停止自动重启。" }
    $service = Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
    if ($service.CommandLine.Replace('/', '\') -match [regex]::Escape((Join-Path $serverRoot 'dist\server\sockets.js'))) {
        $service = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.ParentProcessId)"
    }
    if ($service.Name -ne 'node.exe') { throw '端口未由 Node 游戏服务占用，停止自动重启。' }
    $command = $service.CommandLine.Replace('/', '\')
    $normalPattern = '(?:^|\s)(?:"' + [regex]::Escape($serverCli) + '"|' + [regex]::Escape($serverCli) + '|\.\\pokemon-showdown|pokemon-showdown)(?:\s+start)?\s*$'
    if ($command -match [regex]::Escape($previewScript) -and $command -match "--port\s+$Port(?:\s|$)") {
        $service | Add-Member -NotePropertyName RogueStartMode -NotePropertyValue 'preview'
    } elseif ($command -match $normalPattern) {
        $service | Add-Member -NotePropertyName RogueStartMode -NotePropertyValue 'normal'
    } else {
        throw "端口 $Port 被其他启动方式占用。请先在原服务窗口按 Ctrl+C 关闭它，再运行此脚本。不会自动关闭不明进程。"
    }
    return $service
}

$originalLocation = Get-Location
try {
    $service = Get-GameProcess
    if ($StartMode -eq 'auto') {
        $startMode = if ($service) { $service.RogueStartMode } else { 'preview' }
    } elseif ($service -and $StartMode -ne $service.RogueStartMode) {
        throw '当前服务的存档模式与 StartMode 不一致，停止自动重启。'
    }
    if ($startMode -eq 'normal') {
        Set-Location $serverRoot
        $settings = & $nodeExecutable -e "const {Config}=require('./dist/server/config-loader'); console.log(JSON.stringify({port:Config.port,bind:Config.bindaddress}));" | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $settings.port -ne $Port -or $settings.bind -notin @('127.0.0.1', '::1', 'localhost')) {
            throw '普通启动配置的端口或回环绑定与当前本地服务不一致，停止自动重启。'
        }
    }
    Set-Location $clientRoot
    & $nodeExecutable build full --local-server $serverRoot
    if ($LASTEXITCODE -ne 0) { throw '构建失败，现有游戏服务未停止。' }
    Set-Location $serverRoot
    if ($service) {
        & $nodeExecutable $maintenanceScript inspect $Port
        if ($LASTEXITCODE -ne 0) { throw '服务检查未通过，现有游戏服务未停止。' }
    }
    & $nodeExecutable $maintenanceScript backup
    if ($LASTEXITCODE -ne 0) { throw '存档备份未完成，现有游戏服务未停止。' }
    $current = Get-GameProcess
    if ($service -and (!$current -or $current.ProcessId -ne $service.ProcessId)) {
        throw '构建期间服务进程发生变化，停止自动重启。'
    }
    if (!$service -and $current) { throw '构建期间端口被占用，停止自动重启。' }
    if ($current) {
        & $nodeExecutable $maintenanceScript inspect $Port
        if ($LASTEXITCODE -ne 0) { throw '停止前检查未通过，现有游戏服务未停止。' }
        $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $current.ProcessId -and $_.Name -eq 'node.exe' })
        foreach ($child in $children) {
            if ($child.CommandLine.Replace('/', '\') -notmatch [regex]::Escape((Join-Path $serverRoot 'dist\'))) {
                throw '发现无法确认来源的子进程，停止自动重启。'
            }
        }
        Stop-Process -Id $current.ProcessId -ErrorAction Stop
        foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outputLog = Join-Path $serverRoot "tmp\rogue-local-$stamp.log"
    $errorLog = Join-Path $serverRoot "tmp\rogue-local-$stamp.err"
    $launchArguments = if ($startMode -eq 'normal') { @(('"' + $serverCli + '"')) } else { @(('"' + $previewScript + '"'), '--port', "$Port") }
    $started = Start-Process -FilePath $nodeExecutable -ArgumentList $launchArguments `
        -WorkingDirectory $serverRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        $started.Refresh()
        if ($started.HasExited) { throw "启动失败，请查看：$errorLog" }
        $running = Get-GameProcess
        if ($running -and $running.ProcessId -eq $started.Id) { $ready = $true; break }
    }
    if (!$ready) { throw "服务启动超时，请查看：$outputLog" }
    & $nodeExecutable $maintenanceScript verify $Port
    if ($LASTEXITCODE -ne 0) { throw "服务已启动，但新版内容检查未通过，请查看：$outputLog" }
    Write-Output "已重启新版本地肉鸽，端口 $Port，进程 $($started.Id)。存档备份已完成。"
    Write-Output '浏览器按 Ctrl+F5，然后使用原来的固定测试昵称读取存档。'
    $clientUrl = ([Uri](Join-Path $clientRoot 'play.pokemonshowdown.com\testclient.html')).AbsoluteUri
    Write-Output "本次构建的客户端入口：${clientUrl}?~~localhost:$Port#fantasyrogue"
    Write-Output "日志：$outputLog"
} finally {
    Set-Location $originalLocation
}
