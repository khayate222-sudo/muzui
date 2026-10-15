import { resolve, dirname, join } from "node:path";
import { createBackup, verifyBackup, restoreBackup } from "../server/backup";
const [action, ...args] = process.argv.slice(2);
const value = (key: string) => {
  const i = args.indexOf(key);
  return i < 0 ? undefined : args[i + 1];
};
try {
  if (action === "create") {
    const database = resolve(process.env.DATABASE_PATH || "./data/walk.sqlite"),
      target =
        value("--output") ||
        join("backups", new Date().toISOString().replace(/[:.]/g, "-"));
    const result = await createBackup(
      database,
      target,
      join(dirname(database), "uploads"),
    );
    console.log(
      "バックアップを検証して保存しました。私的なデータを含むため、非公開で保管してください。",
    );
    console.log(result.directory);
  } else if (action === "verify") {
    const source = value("--source");
    if (!source)
      throw new Error("--sourceにバックアップのフォルダーを指定してください");
    await verifyBackup(source);
    console.log("データベースと添付ファイルの整合性を確認しました");
  } else if (action === "restore") {
    const source = value("--source"),
      target = value("--target");
    if (!source || !target)
      throw new Error(
        "--sourceと、存在しない新しい--targetフォルダーを指定してください",
      );
    const result = await restoreBackup(source, target);
    console.log(
      "新しいフォルダーへ復元しました。既存のdata/と.envは変更していません。",
    );
    console.log(result.directory);
  } else
    throw new Error(
      "create --output NEW_DIR / verify --source BACKUP_DIR / restore --source BACKUP_DIR --target NEW_DIR を指定してください",
    );
} catch (e) {
  console.error(
    e instanceof Error ? e.message : "バックアップ処理に失敗しました",
  );
  process.exitCode = 1;
}
