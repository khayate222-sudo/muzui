@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 goto bad_directory
if not exist "package.json" goto missing_files
if not exist "package-lock.json" goto missing_files
if not exist "scripts\check-local.mjs" goto missing_files
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24以上を https://nodejs.org/ からインストールしてください。
  goto failed
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 24以上が必要です。
  goto failed
)
node "scripts\check-local.mjs"
if errorlevel 1 goto failed
echo 使用するNode.js:
node --version
echo 依存関係をインストールしています。
call npm --prefix "." ci
if errorlevel 1 goto failed
call npm --prefix "." run build
if errorlevel 1 goto failed
echo サーバー起動後、同じPCのブラウザで http://localhost:3001 を開いてください。
echo この画面は閉じず、終了するときは Ctrl+C を押します。
call npm --prefix "." start
if errorlevel 1 goto failed
popd
exit /b 0
:missing_files
echo 起動に必要なファイルが見つかりません。
echo ZIPの中から直接実行せず、ZIPを右クリックして「すべて展開」してください。
echo 展開先の walk フォルダーにある START_WINDOWS.cmd を実行してください。
echo 同じフォルダーに package.json と package-lock.json が必要です。
goto failed
:bad_directory
echo WALKのフォルダーを開けませんでした。
echo ZIPを「すべて展開」してから、展開先の walk フォルダーで実行してください。
goto failed_no_popd
:failed
echo 起動できませんでした。上に表示された案内を確認してください。
popd
:failed_no_popd
pause
exit /b 1
