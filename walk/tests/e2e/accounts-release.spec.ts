import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function onboard(p: Page, name: string) {
  await p.goto("/");
  await p.getByLabel("ニックネーム").fill(name);
  await p.getByRole("button", { name: "WALKをはじめる" }).click();
  await expect(p.locator("[role=application][data-ready=true]")).toBeVisible();
}
async function account(p: Page) {
  await p
    .locator(".mobile-nav")
    .getByRole("button", { name: "あなた", exact: true })
    .click();
  await p
    .getByRole("button", { name: "アカウントとデータ", exact: true })
    .click();
  await expect(
    p.getByRole("dialog", { name: "アカウントとデータ" }),
  ).toBeVisible();
}
async function saveRecovery(p: Page) {
  const code = await p.getByLabel("復旧コード", { exact: true }).inputValue();
  expect(code).toMatch(/^[a-f0-9-]{47}$/);
  await p
    .getByRole("checkbox", {
      name: "復旧コードを安全な場所に控えました",
      exact: true,
    })
    .check();
  await p.getByRole("button", { name: "WALKに戻る", exact: true }).click();
  await expect(
    p.getByRole("dialog", { name: "アカウントとデータ" }),
  ).not.toBeVisible();
  await expect(p.locator("[role=application][data-ready=true]")).toBeVisible();
  return code;
}
test("mobile account keeps the guest data, signs in on a second device, revokes it, recovers and deletes only its own data", async ({
  browser,
}) => {
  const ca = await browser.newContext({locale:'ja-JP',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    cb = await browser.newContext({locale:'ja-JP',
      viewport: { width: 320, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  const handle = "walker_" + Date.now(),
    password = "commercial test passphrase",
    nextPassword = "new commercial passphrase";
  try {
    await onboard(a, "記録を守る旅人");
    const before = (await (await a.request.get("/api/bootstrap")).json()).user
      .id;
    await a.request.put("/api/favorites/text-0-0", {
      headers: { "X-Walk-Client": "1" },
      data: { saved: true },
    });
    await a.request.post("/api/activities", {
      headers: { "X-Walk-Client": "1" },
      data: {
        kind: "study",
        title: "引き継ぐ活動",
        endsAt: Date.now() + 3600000,
        shared: false,
        note: "非公開のメモ",
      },
    });
    await account(a);
    await a.getByLabel("ログインID", { exact: true }).fill(handle);
    await a.getByLabel("パスワード", { exact: true }).fill(password);
    await a.getByLabel("パスワードをもう一度", { exact: true }).fill(password);
    await a
      .getByRole("button", {
        name: "利用ルールとプライバシーを読む",
        exact: true,
      })
      .click();
    await expect(
      a.getByRole("dialog", { name: "WALKについて・利用ルール" }),
    ).toContainText("開発版の案内");
    await a
      .getByRole("dialog", { name: "WALKについて・利用ルール" })
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await a
      .getByRole("checkbox", {
        name: "開発版の利用ルール・プライバシー案内を確認しました",
        exact: true,
      })
      .check();
    await a
      .getByRole("button", { name: "このゲストをアカウント登録", exact: true })
      .click();
    const code = await saveRecovery(a);
    const boot = await (await a.request.get("/api/bootstrap")).json();
    expect(boot.user.id).toBe(before);
    expect(boot.favorites).toContain("text-0-0");
    await b.goto("/");
    await b
      .getByRole("button", {
        name: "登録済みのアカウントでログイン",
        exact: true,
      })
      .click();
    await b.getByLabel("ログインID", { exact: true }).fill(handle);
    await b.getByLabel("パスワード", { exact: true }).fill(password);
    await b.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(
      b.getByRole("dialog", { name: "アカウントとデータ" }),
    ).not.toBeVisible();
    await expect(
      b.locator("[role=application][data-ready=true]"),
    ).toBeVisible();
    expect((await (await b.request.get("/api/bootstrap")).json()).user.id).toBe(
      before,
    );
    await expect(b.locator(".connection")).toContainText("1人が散歩中");
    expect(
      (await (await b.request.get("/api/activities")).json())[0].note,
    ).toBe("非公開のメモ");
    await account(a);
    await expect(a.locator(".account-identity")).toContainText(handle);
    await a
      .getByRole("button", { name: "他の端末をログアウト", exact: true })
      .click();
    await a.getByLabel("パスワード", { exact: true }).fill(password);
    await a
      .getByRole("button", { name: "他の端末をログアウト", exact: true })
      .click();
    await expect(
      a.locator("[role=application][data-ready=true]"),
    ).toBeVisible();
    await expect(
      b.getByRole("heading", { name: "あなたのWALKへ、もう一度。" }),
    ).toBeVisible();
    const reloaded = await b.reload();
    expect(reloaded?.status()).toBe(200);
    await expect(
      b.getByRole("heading", { name: "あなたのWALKへ、もう一度。" }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "ログイン・復旧する", exact: true })
      .click();
    await b
      .getByRole("button", {
        name: "パスワードを忘れた・復旧コードで戻る",
        exact: true,
      })
      .click();
    await b.getByLabel("ログインID", { exact: true }).fill(handle);
    await b.getByLabel("登録時の復旧コード", { exact: true }).fill(code);
    await b.getByLabel("新しいパスワード", { exact: true }).fill(nextPassword);
    await b
      .getByLabel("パスワードをもう一度", { exact: true })
      .fill(nextPassword);
    await b
      .getByRole("button", { name: "復旧してパスワードを更新", exact: true })
      .click();
    expect(await saveRecovery(b)).not.toBe(code);
    await expect(
      a.getByRole("heading", { name: "あなたのWALKへ、もう一度。" }),
    ).toBeVisible();
    await account(b);
    await b
      .getByRole("button", { name: "自分のデータを取得", exact: true })
      .click();
    await b.getByLabel("パスワード", { exact: true }).fill(nextPassword);
    const download = b.waitForEvent("download");
    await b.getByRole("button", { name: "データを保存", exact: true }).click();
    const file = await download;
    const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(exported.profile.id).toBe(before);
    expect(exported.activities[0].note).toBe("非公開のメモ");
    expect(JSON.stringify(exported)).not.toMatch(
      /password_hash|recovery_hash|token_hash/,
    );
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await b.screenshot({ path: "artifacts/account-data-mobile.png" });
    await b.goto("/#/delete-account");
    await expect(
      b.getByRole("dialog", { name: "アカウントとデータ" }),
    ).toContainText("WALKのデータを削除する。");
    await b.getByLabel("パスワード", { exact: true }).fill(nextPassword);
    await b.getByLabel("削除の確認", { exact: true }).fill("削除");
    await b
      .getByRole("button", { name: "データの削除を実行", exact: true })
      .click();
    await expect(
      b.getByRole("dialog", { name: "WELCOME TO WALK" }),
    ).toBeVisible();
    await expect(b.getByLabel("ニックネーム")).toBeVisible();
    expect(
      (await (await b.request.get("/api/bootstrap")).json()).user.id,
    ).not.toBe(before);
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});
test("admin resolves reports and suspends and restores a user while preserving the user data controls", async ({
  browser,
}) => {
  const ca = await browser.newContext({locale:'ja-JP'}),
    cb = await browser.newContext({locale:'ja-JP',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await onboard(a, "対応する管理者");
    await onboard(b, "対象の旅人");
    const posted = await b.request.post("/api/posts", {
        headers: { "X-Walk-Client": "1" },
        data: {
          title: "運用検証用の投稿",
          body: "テストの本文",
          genre: "art",
          attachmentId: null,
        },
      }),
      id = (await posted.json()).id;
    await a.request.post("/api/reports", {
      headers: { "X-Walk-Client": "1" },
      data: {
        targetType: "post",
        targetId: id,
        reason: "運用の検証として内容を確認してください",
      },
    });
    await a.getByRole("button", { name: "管理画面", exact: true }).click();
    await a
      .getByLabel("管理者キー")
      .fill("e2e-only-admin-key-12345678901234567890");
    await a.getByRole("button", { name: "認証する", exact: true }).click();
    const row = a
      .locator(".moderation-queue article")
      .filter({ hasText: "運用検証用の投稿" });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: "対象ユーザーを利用停止", exact: true })
      .click();
    await a
      .getByLabel("本人に示す理由", { exact: true })
      .fill("内容を確認するため一時停止しています");
    await a
      .getByRole("button", { name: "対応を確定する", exact: true })
      .click();
    await expect(
      b.getByRole("heading", { name: "アカウントの利用を停止しています。" }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "アカウントとデータ", exact: true })
      .click();
    await b
      .getByRole("button", { name: "ゲストのデータを取得", exact: true })
      .click();
    await expect(
      b.getByRole("button", { name: "データを保存", exact: true }),
    ).toBeVisible();
    await b.getByRole("button", { name: "閉じる", exact: true }).click();
    await row
      .getByRole("button", { name: "対応済みにする", exact: true })
      .click();
    await a
      .getByLabel("対応メモ", { exact: true })
      .fill("検証として確認し対応を完了しました");
    await a
      .getByRole("button", { name: "対応を確定する", exact: true })
      .click();
    await a
      .locator(".moderation-queue .filter-tabs")
      .getByRole("button", { name: "すべて", exact: true })
      .click();
    await expect(row).toContainText("対応済み");
    await row
      .getByRole("button", { name: "利用停止を解除", exact: true })
      .click();
    await a
      .getByLabel("本人に示す理由", { exact: true })
      .fill("確認が終わったので利用を再開します");
    await a
      .getByRole("button", { name: "対応を確定する", exact: true })
      .click();
    await b
      .getByRole("button", { name: "状態を再確認する", exact: true })
      .click();
    await expect(
      b.locator("[role=application][data-ready=true]"),
    ).toBeVisible();
    await expect(b.locator(".connection")).toContainText("2人が散歩中");
  } finally {
    await ca.close();
    await cb.close();
  }
});
