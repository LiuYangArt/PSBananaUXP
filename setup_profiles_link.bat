

:: 设置路径变量
set "PLUGIN_PATH=%~dp0Profiles"
set "STORAGE_PATH=%APPDATA%\Adobe\UXP\PluginsStorage\PHSP\24\External\com.liuyang.psbanana\PluginData"

echo 插件 Profiles 路径: %PLUGIN_PATH%
echo 存储 Profiles 路径: %STORAGE_PATH%
echo.


:: 检查存储路径是否存在
if not exist "%STORAGE_PATH%" (
    echo [警告] 存储路径不存在，将创建父目录
    mkdir "%APPDATA%\Adobe\UXP\PluginsStorage\PHSP\24\External\com.liuyang.psbanana\" 2>nul
)
:: 删除已有的存储路径
else if exist "%STORAGE_PATH%" (
    echo 删除已有的存储路径...
    rmdir /s /q "%STORAGE_PATH%"
)



mklink /j "%STORAGE_PATH%" "%PLUGIN_PATH%" 


pause
