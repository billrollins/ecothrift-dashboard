@echo off
setlocal enabledelayedexpansion

REM Check if .env file exists
if not exist ".env" (
    echo Error: .env file not found in current directory
    exit /b 1
)

REM Read .env file line by line
for /f "usebackq tokens=* delims=" %%A in (".env") do (
    set "line=%%A"
    
    REM Skip empty lines
    if defined line (
        REM Get first character to check for comment
        set "firstchar=!line:~0,1!"
        
        REM Skip comment lines (starting with #)
        if not "!firstchar!"=="#" (
            REM Extract everything before the = sign
            for /f "tokens=1 delims==" %%B in ("!line!") do (
                set "varname=%%B"
                REM Trim leading/trailing spaces and output
                call :trim varname
                if defined varname echo !varname!=
            )
        )
    )
)

endlocal
exit /b 0

:trim
setlocal enabledelayedexpansion
set "str=!%~1!"
for /f "tokens=* delims= " %%a in ("!str!") do set "str=%%a"
REM Remove trailing spaces
if defined str (
    for /l %%i in (1,1,100) do if "!str:~-1!"==" " set "str=!str:~0,-1!"
)
endlocal & set "%~1=%str%"
goto :eof