import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Check a fully extracted application before npm is invoked. Never change its lockfile. */
export function checkLocalProject(directory) {
  for (const name of ['package.json', 'package-lock.json', 'server/index.ts', 'scripts/start-production.mjs']) {
    let file = false;
    try { file = statSync(resolve(directory, name)).isFile(); } catch { /* missing or unreadable */ }
    if (!file) throw new Error(`${name} が見つかりません。ZIPを右クリックして「すべて展開」し、展開先の walk フォルダーから起動してください。`);
  }
  let manifest, lock;
  try {
    manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    lock = JSON.parse(readFileSync(resolve(directory, 'package-lock.json'), 'utf8'));
  } catch {
    throw new Error('package.json または package-lock.json を読み込めません。ZIPをもう一度ダウンロードして、別のフォルダーにすべて展開してください。');
  }
  if (manifest.name !== 'walk-social' || lock.name !== manifest.name || !Number.isInteger(lock.lockfileVersion) || lock.lockfileVersion < 1) {
    throw new Error('WALK用の package.json と package-lock.json が揃っていません。展開先の walk フォルダーから起動してください。');
  }
  return { name: manifest.name, lockfileVersion: lock.lockfileVersion };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = checkLocalProject(fileURLToPath(new URL('../', import.meta.url)));
    console.log(`WALKの必要ファイルを確認しました（lockfileVersion ${result.lockfileVersion}）。`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'WALKの必要ファイルを確認できません。');
    process.exitCode = 1;
  }
}
