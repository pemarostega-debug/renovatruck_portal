@echo off
cd /d "%~dp0"
node extrator-ordens.js >> extrator.log 2>&1
