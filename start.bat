@echo off
chcp 65001 >nul
title 技毅力 - 网络配置工具
cd /d "%~dp0"

echo.
echo    ╔══════════════════════════════════════╗
echo    ║        技毅力 - 网络配置工具        ║
echo    ╠══════════════════════════════════════╣
echo    ║                                      ║
echo    ║  浏览器打开: http://localhost:3001    ║
echo    ║                                      ║
echo    ╚══════════════════════════════════════╝
echo.
echo   正在启动...

start "" http://localhost:3001
node server\index.cjs
pause
