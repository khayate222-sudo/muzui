import Database from "better-sqlite3";
import {
  mkdir,
  mkdtemp,
  copyFile,
  chmod,
  readFile,
  writeFile,
  lstat,
  rename,
  rm,
  access,
} from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
type Entry = { path: string; bytes: number; sha256: string };
type Manifest = { format: "walk-backup-1"; createdAt: number; files: Entry[] };
const mediaName = /^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/;
const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
async function fileEntry(root: string, path: string): Promise<Entry> {
  const filename = join(root, path),
    stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("通常のファイルだけをバックアップできます");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return { path, bytes: stat.size, sha256: hash.digest("hex") };
}
function uploadNames(database: string) {
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("quick_check", { simple: true }) !== "ok")
      throw new Error("SQLiteの整合性を確認できません");
    if ((db.pragma("foreign_key_check") as unknown[]).length)
      throw new Error("データの参照関係に不整合があります");
    return db
      .prepare("SELECT filename,bytes FROM media_uploads ORDER BY filename")
      .all() as { filename: string; bytes: number }[];
  } finally {
    db.close();
  }
}
async function unusedDestination(destination: string) {
  if (await exists(destination))
    throw new Error(
      "保存先には存在しない新しいフォルダーを指定してください。既存ファイルは上書きしません",
    );
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
}
export async function createBackup(
  database: string,
  destination: string,
  mediaDirectory = join(dirname(database), "uploads"),
) {
  const source = resolve(database),
    target = resolve(destination);
  if (target === source || target.startsWith(resolve(mediaDirectory) + sep))
    throw new Error("アップロード用フォルダーの外を保存先にしてください");
  await unusedDestination(target);
  const sourceDb = new Database(source, {
      readonly: true,
      fileMustExist: true,
    }),
    staging = await mkdtemp(join(dirname(target), ".walk-backup-"));
  let completed = false;
  try {
    await sourceDb.backup(join(staging, "walk.sqlite"));
    await chmod(join(staging, "walk.sqlite"), 0o600);
    sourceDb.close();
    const uploads = uploadNames(join(staging, "walk.sqlite")),
      files: Entry[] = [await fileEntry(staging, "walk.sqlite")];
    await mkdir(join(staging, "uploads"), { mode: 0o700 });
    for (const row of uploads) {
      if (!mediaName.test(row.filename))
        throw new Error("アップロードのファイル名を確認してください");
      const stat = await lstat(join(mediaDirectory, row.filename));
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("添付ファイルを確認できません");
      const relative = "uploads/" + row.filename;
      await copyFile(
        join(mediaDirectory, row.filename),
        join(staging, relative),
        constants.COPYFILE_EXCL,
      );
      await chmod(join(staging, relative), 0o600);
      const entry = await fileEntry(staging, relative);
      if (entry.bytes !== row.bytes)
        throw new Error("添付ファイルのサイズが一致しません");
      files.push(entry);
    }
    const manifest: Manifest = {
      format: "walk-backup-1",
      createdAt: Date.now(),
      files,
    };
    await writeFile(
      join(staging, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    await verifyBackup(staging);
    await unusedDestination(target);
    await rename(staging, target);
    completed = true;
    return { directory: target, files: files.length };
  } finally {
    if (sourceDb.open) sourceDb.close();
    if (!completed) await rm(staging, { recursive: true, force: true });
  }
}
export async function verifyBackup(directory: string) {
  const root = resolve(directory),
    manifest = JSON.parse(
      await readFile(join(root, "manifest.json"), "utf8"),
    ) as Manifest;
  if (
    manifest.format !== "walk-backup-1" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  )
    throw new Error("WALKのバックアップではありません");
  const names = new Set<string>();
  for (const f of manifest.files) {
    if (
      typeof f.path !== "string" ||
      !(
        f.path === "walk.sqlite" ||
        (f.path.startsWith("uploads/") && mediaName.test(f.path.slice(8)))
      ) ||
      names.has(f.path) ||
      !Number.isSafeInteger(f.bytes) ||
      !/^[a-f0-9]{64}$/.test(f.sha256)
    )
      throw new Error("バックアップのファイル一覧が正しくありません");
    names.add(f.path);
    const actual = await fileEntry(root, f.path);
    if (actual.bytes !== f.bytes || actual.sha256 !== f.sha256)
      throw new Error("バックアップの整合性チェックに失敗しました");
  }
  if (!names.has("walk.sqlite")) throw new Error("データベースがありません");
  const uploads = uploadNames(join(root, "walk.sqlite"));
  if (
    names.size !== uploads.length + 1 ||
    uploads.some((f) => !names.has("uploads/" + f.filename))
  )
    throw new Error("データベースと添付ファイルの組み合わせが一致しません");
  return manifest;
}
export async function restoreBackup(directory: string, destination: string) {
  const source = resolve(directory),
    target = resolve(destination);
  if (target === source || target.startsWith(source + sep))
    throw new Error("バックアップの外の新しいフォルダーへ復元してください");
  await unusedDestination(target);
  const manifest = await verifyBackup(source),
    staging = await mkdtemp(join(dirname(target), ".walk-restore-"));
  let completed = false;
  try {
    await mkdir(join(staging, "uploads"), { mode: 0o700 });
    for (const entry of manifest.files) {
      await copyFile(
        join(source, entry.path),
        join(staging, entry.path),
        constants.COPYFILE_EXCL,
      );
      await chmod(join(staging, entry.path), 0o600);
      const copied = await fileEntry(staging, entry.path);
      if (copied.sha256 !== entry.sha256 || copied.bytes !== entry.bytes)
        throw new Error("復元中にファイルが変更されました");
    }
    uploadNames(join(staging, "walk.sqlite"));
    await unusedDestination(target);
    await rename(staging, target);
    completed = true;
    return { directory: target, files: manifest.files.length };
  } finally {
    if (!completed) await rm(staging, { recursive: true, force: true });
  }
}
