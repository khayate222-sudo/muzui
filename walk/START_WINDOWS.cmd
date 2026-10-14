@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24以上を https://nodejs.org/ からインストールしてください。
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 24以上が必要です。
  pause
  exit /b 1
)
echo 依存関係をインストールしています。
call npm ci
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo サーバー起動後、同じPCのブラウザで http://localhost:3001 を開いてください。
echo この画面は閉じず、終了するときは Ctrl+C を押します。
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo 起動できませんでした。上に表示されたエラーを確認してください。
pause
exit /b 1
