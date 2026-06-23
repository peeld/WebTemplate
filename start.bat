@echo off
set ROOT=%~dp0

start "Django Backend" cmd /k "cd /d %ROOT%core\backend && %ROOT%venv\Scripts\python.exe manage.py runserver"

start "Vite Frontend" cmd /k "cd /d "%ROOT%core\frontend" && npm run dev"
