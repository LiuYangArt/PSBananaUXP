@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Get versions using Node.js
node -e "const v = require('./package.json').version; const [ma, mi, pa] = v.split('.').map(Number); console.log('set CURRENT_VERSION=' + v); console.log('set NEXT_PATCH=' + ma + '.' + mi + '.' + (pa + 1)); console.log('set NEXT_MINOR=' + ma + '.' + (mi + 1) + '.0'); console.log('set NEXT_MAJOR=' + (ma + 1) + '.0.0');" > versions.bat

call versions.bat
del versions.bat

:menu
cls
echo ========================================================
echo       Obsidian 插件一键发布助手 (Canvas Banana)
echo ========================================================
echo.
echo  当前版本: !CURRENT_VERSION!
echo.
echo  请选择升级类型：
echo.
echo  [1] 补丁 (Patch) : 修复 Bug (!CURRENT_VERSION! -^> !NEXT_PATCH!)
echo  [2] 次版本 (Minor): 新增功能 (!CURRENT_VERSION! -^> !NEXT_MINOR!)
echo  [3] 主版本 (Major): 重大变更 (!CURRENT_VERSION! -^> !NEXT_MAJOR!)
echo  [4] 退出
echo.
echo ========================================================
echo.

set /p choice="请输入选项 [1-4]: "

if "%choice%"=="1" set vtype=patch
if "%choice%"=="2" set vtype=minor
if "%choice%"=="3" set vtype=major
if "%choice%"=="4" goto :eof

if not defined vtype (
    echo 无效输入，请重新选择。
    timeout /t 2 >nul
    goto menu
)

echo.
echo --------------------------------------------------------
echo [1/2] 正在执行 npm version %vtype% ...
echo --------------------------------------------------------
call npm version %vtype%

if %errorlevel% neq 0 (
    echo.
    echo [错误] 版本更新失败！请检查是否有未提交的更改。
    echo 按任意键返回...
    pause >nul
    goto menu
)

echo.
echo --------------------------------------------------------
echo [2/2] 准备推送到 GitHub ...
echo --------------------------------------------------------
echo 即将把新版本标签推送到远程仓库，这将触发 GitHub Actions 自动发布。
echo.
set /p confirm="确认推送吗? (Y/N): "

if /i "%confirm%"=="y" (
    echo.
    echo 正在推送...
    git push --follow-tags
    
    if !errorlevel! equ 0 (
        echo.
        echo ========================================================
        echo  ✅ 发布成功！
        echo  请访问 GitHub 仓库的 Actions 页面查看构建进度。
        echo ========================================================
    ) else (
        echo.
        echo [错误] 推送失败，请检查网络或 Git 配置。
    )
) else (
    echo.
    echo 已取消推送。版本号已在本地更新并提交。
    echo 你稍后可以手动运行: git push --follow-tags
)

pause
