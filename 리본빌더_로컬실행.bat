@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py -3 "ribbon_builder_local.py" & goto :eof)
where python >nul 2>nul && (python "ribbon_builder_local.py" & goto :eof)
echo Python이 설치되어 있지 않습니다. https://www.python.org 에서 설치한 뒤 다시 실행하세요.
pause
