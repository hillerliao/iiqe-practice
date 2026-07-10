# 部署到 VPS:PowerShell 端流程。
# 流程:
#  1) 在本机 pnpm/npm build 产出 .next(由调用方在 deploy 前完成)
#  2) 打包 .next + 运行时文件到 iiqe-runtime-update.tar.gz
#  3) scp 上传到 VPS:/home/ecs-user/
#  4) scp deploy-remote.sh 到 VPS(覆盖远端版本,保持单一来源)
#  5) ssh 在 VPS 上执行 deploy-remote.sh
#
# 这个脚本只做"上传 + 触发";所有数据库备份/Prisma/健康检查逻辑都在
# deploy-remote.sh 里维护,避免 PowerShell 与 bash 双份同步。

Set-Location d:\Downloads\IIQE\iiqe-app

# 部署目标:从环境变量读取,避免在仓库里写死 VPS 地址
#   $env:DEPLOY_HOST = 'user@your-vps-ip'   (SSH user@host 完整形式)
#   $env:DEPLOY_USER = 'your-user'          (可选,默认从 DEPLOY_HOST 推导)
$DeployHost = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { 'user@your-vps-ip' }
$DeployUser = if ($env:DEPLOY_USER) { $env:DEPLOY_USER } else { ($DeployHost -split '@')[0] }
$DeployAddr = $DeployHost

$out = 'ssh.out.log'; $err = 'ssh.err.log'
$scpOut = 'scp.out.log'; $scpErr = 'scp.err.log'
$upOut = 'upload.out.log'; $upErr = 'upload.err.log'

foreach ($f in @($out, $err, $scpOut, $scpErr, $upOut, $upErr)) {
  if (Test-Path $f) { Remove-Item -Force $f }
}

# 1) 打包(在调用 deploy-remote.ps1 之前应已 pnpm build 完成)
if (-not (Test-Path '.next')) {
  Write-Output "ERROR: .next not found; run 'pnpm build' first."
  exit 1
}

$tarball = 'iiqe-runtime-update.tar.gz'
if (Test-Path $tarball) { Remove-Item -Force $tarball }

# tar 列表:覆盖 VPS 运行时需要的全部文件
# 注意:prisma/ 含 schema.prisma;data/ 含题库 JSON(给 seed 用);scripts/ 含 verify-storage.ts
$tarItems = @('.next','public','scripts','prisma','data','app','components','lib',
              'package.json','package-lock.json','next.config.ts','tsconfig.json')
$tarList = $tarItems | Where-Object { Test-Path $_ }

# PowerShell 5.1 没有原生 tar(Win10 1803+ 有 tar.exe),用 Compress-Archive 走 zip 改走 tar
# 这里假设环境有 tar.exe(Git for Windows / Windows 10+ 自带)
$paths = ($tarList | ForEach-Object { '"' + $_ + '"' }) -join ' '
$tarCmd = "tar -czf $tarball $paths"
Write-Output "[1/4] packing: $tarCmd"
cmd /c $tarCmd 2>&1 | Out-Null
if (-not (Test-Path $tarball)) {
  Write-Output "ERROR: tarball not produced"
  exit 1
}

# 2) 上传 tarball + deploy-remote.sh 到 VPS
Write-Output "[2/4] uploading tarball + deploy-remote.sh"
$scpTar = Start-Process -FilePath 'scp.exe' -ArgumentList @(
  '-o','ConnectTimeout=10','-o','StrictHostKeyChecking=no',
  $tarball,"${DeployAddr}:/home/${DeployUser}/"
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $scpOut -RedirectStandardError $scpErr
$null = $scpTar.WaitForExit(120000)
if (-not $scpTar.HasExited -or $scpTar.ExitCode -ne 0) {
  Write-Output "ERROR: scp tarball failed (exit=$($scpTar.ExitCode))"
  Get-Content -LiteralPath $scpErr -Raw -ErrorAction SilentlyContinue
  exit 1
}

$scpSh = Start-Process -FilePath 'scp.exe' -ArgumentList @(
  '-o','ConnectTimeout=10','-o','StrictHostKeyChecking=no',
  'deploy-remote.sh',"${DeployAddr}:/home/${DeployUser}/deploy-remote.sh"
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $upOut -RedirectStandardError $upErr
$null = $scpSh.WaitForExit(60000)
if (-not $scpSh.HasExited -or $scpSh.ExitCode -ne 0) {
  Write-Output "ERROR: scp deploy-remote.sh failed (exit=$($scpSh.ExitCode))"
  Get-Content -LiteralPath $upErr -Raw -ErrorAction SilentlyContinue
  exit 1
}

# 3) 远端执行 deploy-remote.sh
Write-Output "[3/4] executing deploy-remote.sh on VPS"
$remoteCmd = "chmod +x /home/${DeployUser}/deploy-remote.sh && /home/${DeployUser}/deploy-remote.sh"
$p = Start-Process -FilePath 'C:\Windows\System32\OpenSSH\ssh.exe' -ArgumentList @(
  '-o','ConnectTimeout=10','-o','StrictHostKeyChecking=no',
  $DeployAddr, $remoteCmd
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
$null = $p.WaitForExit(600000)  # 10 分钟,给 db:push + seed + verify 留余量
if ($p.HasExited) { Write-Output "ssh exitcode=$($p.ExitCode)" } else { Stop-Process -Id $p.Id -Force; Write-Output 'ssh timeout, killed' }

# 4) 输出日志
Write-Output '---OUT---'
if (Test-Path $out) { Get-Content -LiteralPath $out -Raw }
Write-Output '---ERR---'
if (Test-Path $err) { Get-Content -LiteralPath $err -Raw }

if ($p.HasExited -and $p.ExitCode -ne 0) {
  Write-Output "deploy FAILED with exitcode=$($p.ExitCode). See logs above."
  exit $p.ExitCode
}
Write-Output "[4/4] deploy OK"
