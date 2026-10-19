import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackup, restoreBackup, verifyBackup } from "../server/backup";
import { openDatabase } from "../server/db";
import { hashPassword, recoveryDigest } from "../server/passwords";
import { createApp } from "../server/app";
it("backs up SQLite and its exact media, restores to a new folder, and starts with the original private records", async () => {
  const root = await mkdtemp(join(tmpdir(), "walk-backup-test-")),
    database = join(root, "original", "walk.sqlite"),
    store = openDatabase(database),
    uploads = join(root, "original", "uploads"),
    filename = "11111111-1111-4111-8111-111111111111.png";
  try {
    await mkdir(uploads);
    await writeFile(join(uploads, filename), "test-image");
    store.sqlite
      .prepare(
        "INSERT INTO users VALUES ('owner','記録の持ち主','#112233','fox',0,?)",
      )
      .run(Date.now());
    store.sqlite
      .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "owner",
        "backup_owner",
        await hashPassword("backup long passphrase"),
        recoveryDigest("backup-code"),
        "development-2026-10",
        Date.now(),
        Date.now(),
        Date.now(),
      );
    store.sqlite
      .prepare(
        "INSERT INTO media_uploads VALUES ('media','owner',?,'image/png',10,?)",
      )
      .run(filename, Date.now());
    store.sqlite
      .prepare(
        "INSERT INTO activities (id,user_id,kind,title,starts_at,ends_at,note,photo,photo_mime) VALUES ('record','owner','study','勉強',?,?,'私的なメモ',?,'image/png')",
      )
      .run(Date.now(), Date.now() + 10000, Buffer.from("private-photo"));
    store.sqlite.prepare("INSERT INTO post_requests VALUES ('owner','retry-key','payload-hash',NULL,?)").run(Date.now());
    store.sqlite.prepare("INSERT INTO rooms (id,owner_id,title,description,is_public,theme,layout,updated_at) VALUES ('room','owner','Workshop','',1,'garden',?,1)").run(JSON.stringify({items:[],decorations:[]}));
    const pieces=JSON.stringify([{x:2,y:2,z:0,kind:'wall',color:'cream',rotation:0}]);
    store.sqlite.prepare("INSERT INTO room_builds VALUES ('room',1,?,'build-request','save:hash',1)").run(pieces);
    store.sqlite.prepare("INSERT INTO room_build_history VALUES ('snapshot','room',0,'[]',1)").run();
    store.sqlite.prepare("INSERT INTO game_coin_entries VALUES ('coin','owner',200,'daily:backup',1)").run();
    store.sqlite.prepare("INSERT INTO play_chip_entries VALUES ('chip','owner',100,'daily:backup',1)").run();
    store.sqlite.prepare("INSERT INTO game_cosmetics VALUES ('owner','sakura',1)").run();
    const backup = join(root, "snapshot");
    await createBackup(database, backup, uploads);
    const manifest = await verifyBackup(backup);
    expect(manifest.files).toHaveLength(2);
    expect((await stat(backup)).mode & 0o777).toBe(0o700);
    const restored = join(root, "restored");
    await restoreBackup(backup, restored);
    const app = await createApp({
      database: join(restored, "walk.sqlite"),
      adminKey: "backup-test-admin-key",
    });
    try {
      expect(
        (
          app.store.sqlite
            .prepare("SELECT note,photo FROM activities WHERE id='record'")
            .get() as { note: string; photo: Buffer }
        ).note,
      ).toBe("私的なメモ");
      expect(app.store.sqlite.prepare("SELECT payload_hash,post_id FROM post_requests WHERE request_id='retry-key'").get()).toEqual({payload_hash:'payload-hash',post_id:null});
      expect((await app.app.inject({ url: "/api/health" })).statusCode).toBe(
        200,
      );
      const login = await app.app.inject({
        url: "/api/auth/login",
        method: "POST",
        headers: { "x-walk-client": "1" },
        payload: { handle: "backup_owner", password: "backup long passphrase" },
      });
      expect(login.statusCode, login.body).toBe(200);
      const cookie=login.headers['set-cookie']!.toString().split(';')[0];
      const economy=(await app.app.inject({url:'/api/economy',headers:{cookie}})).json();expect(economy).toMatchObject({coins:200,chips:100,owned:['sakura']});
      const room=(await app.app.inject({url:'/api/rooms/room',headers:{cookie}})).json();expect(room.build).toMatchObject({revision:1,pieces:JSON.parse(pieces)});
      expect(app.store.sqlite.prepare("SELECT COUNT(*) AS n FROM room_build_history WHERE room_id='room'").get()).toEqual({n:1});
      expect(await readFile(join(restored, "uploads", filename), "utf8")).toBe(
        "test-image",
      );
    } finally {
      await app.app.close();
    }
    expect(
      (
        store.sqlite
          .prepare("SELECT note FROM activities WHERE id='record'")
          .get() as { note: string }
      ).note,
    ).toBe("私的なメモ");
  } finally {
    store.sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses a corrupt snapshot and existing restore destination without overwriting either source or user files", async () => {
  const root = await mkdtemp(join(tmpdir(), "walk-backup-safety-")),
    db = openDatabase(join(root, "source.sqlite"));
  try {
    await createBackup(join(root, "source.sqlite"), join(root, "backup"));
    const target = join(root, "existing");
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "keep");
    await expect(restoreBackup(join(root, "backup"), target)).rejects.toThrow(
      "上書き",
    );
    expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("keep");
    await writeFile(join(root, "backup", "walk.sqlite"), "corrupt");
    await expect(verifyBackup(join(root, "backup"))).rejects.toThrow("整合性");
    await expect(
      restoreBackup(join(root, "backup"), join(root, "new")),
    ).rejects.toThrow();
    expect(db.sqlite.prepare("PRAGMA quick_check").get()).toEqual({
      quick_check: "ok",
    });
  } finally {
    db.sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
});
