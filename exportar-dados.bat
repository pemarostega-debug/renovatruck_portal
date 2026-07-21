@echo off
cd /d "%~dp0"
node exportar-dados.js >> exportar.log 2>&1
