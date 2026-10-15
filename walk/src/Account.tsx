import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  KeyRound,
  LogOut,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { AccountSummary, AuthResult } from "../shared/accounts";
import type { LegalConfiguration } from "../shared/release";
import { api } from "./api";
import {
  replaceNativeSession,
  announceSessionChange,
  saveDataExport,
} from "./native";
import Modal from "./Modal";
import Legal from "./Legal";
type Screen =
  | "register"
  | "login"
  | "recover"
  | "manage"
  | "credentials"
  | "export"
  | "delete"
  | "sessions";
export default function Account({
  close,
  authOnly = false,
  initialScreen,
}: {
  close: () => void;
  authOnly?: boolean;
  initialScreen?: "login" | "register" | "delete";
}) {
  const [status, setStatus] = useState<AccountSummary | null>(null),
    [config, setConfig] = useState<LegalConfiguration | null>(null),
    [screen, setScreen] = useState<Screen>(
      initialScreen || (authOnly ? "login" : "register"),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState<{ code: string; handle: string } | null>(
      null,
    ),
    [legal, setLegal] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<AccountSummary>("/account").catch(() => null),
      api<LegalConfiguration>("/public/legal"),
    ])
      .then(([account, info]) => {
        if (!active) return;
        setStatus(account);
        setConfig(info);
        if (account?.registered)
          setScreen(initialScreen === "delete" ? "delete" : "manage");
        else if (initialScreen === "delete") setScreen("login");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [initialScreen]);
  const secretField = useRef<HTMLInputElement>(null);
  const change = (next: Screen) => {
    setScreen(next);
    setError("");
    setMessage("");
  };
  async function work(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }
  async function session(result: AuthResult) {
    if (result.recoveryCode)
      setSecret({
        code: result.recoveryCode,
        handle: result.handle || status?.handle || "",
      });
    await replaceNativeSession(result.token);
    if (!result.recoveryCode) announceSessionChange();
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      password = String(f.get("password") || "");
    await work(async () => {
      if (
        screen === "register" ||
        screen === "recover" ||
        screen === "credentials"
      ) {
        const next =
          screen === "credentials"
            ? String(f.get("newPassword") || "")
            : password;
        if (next !== String(f.get("confirmPassword") || ""))
          throw new Error("確認用のパスワードが一致しません");
      }
      if (screen === "register")
        await session(
          await api<AuthResult>("/account/register", "POST", {
            handle: f.get("handle"),
            password,
            accepted: f.get("accepted") === "on",
            policyVersion: config?.policyVersion,
          }),
        );
      if (screen === "login")
        await session(
          await api<AuthResult>("/auth/login", "POST", {
            handle: f.get("handle"),
            password,
          }),
        );
      if (screen === "recover")
        await session(
          await api<AuthResult>("/auth/recover", "POST", {
            handle: f.get("handle"),
            password,
            recoveryCode: f.get("recoveryCode"),
          }),
        );
      if (screen === "credentials")
        await session(
          await api<AuthResult>("/account/credentials", "POST", {
            password,
            newPassword: f.get("newPassword"),
          }),
        );
      if (screen === "sessions")
        await session(
          await api<AuthResult>("/account/logout-others", "POST", { password }),
        );
      if (screen === "export") {
        const result = await api<unknown>(
          "/account/export",
          "POST",
          status?.registered ? { password } : {},
        );
        await saveDataExport(result);
        setMessage("データの保存画面を開きました");
      }
      if (screen === "delete") {
        await api("/account/delete", "POST", {
          confirm: f.get("confirm"),
          ...(status?.registered ? { password } : {}),
        });
        await replaceNativeSession();
        announceSessionChange(false);
      }
    });
  }
  const header =
    screen === "manage"
      ? "あなたのWALKを、これからも。"
      : screen === "register"
        ? "この寄り道を、なくさない。"
        : screen === "login"
          ? "あなたのWALKへ戻る。"
          : screen === "recover"
            ? "復旧コードで、戻ろう。"
            : screen === "export"
              ? "自分のデータを保存する。"
              : screen === "delete"
                ? "WALKのデータを削除する。"
                : screen === "sessions"
                  ? "他の端末をログアウトする。"
                  : "パスワードと復旧コードを更新";
  const passwordField = (
    label: string,
    name: string,
    autocomplete: string,
    min?: number,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type="password"
        autoComplete={autocomplete}
        minLength={min}
        maxLength={128}
        required
      />
    </label>
  );
  return (
    <>
      <Modal
        title="アカウントとデータ"
        close={() => {
          if (secret) {
            setError(
              "復旧コードを控えたことを確認してから、WALKに戻ってください",
            );
            return;
          }
          if (!busy) close();
        }}
      >
        <div className="account-panel">
          <span className="account-symbol">
            <KeyRound size={26} />
          </span>
          {secret ? (
            <>
              <p className="eyebrow">KEEP THIS SAFE</p>
              <h2>復旧コードを控えてください。</h2>
              <p>
                ログインID：<strong>{secret.handle}</strong>
              </p>
              <p>
                パスワードを忘れた時に使います。再表示できません。他の人に渡さず、安全な場所に保管してください。古い復旧コードは使えなくなります。
              </p>
              <label>
                復旧コード
                <input
                  ref={secretField}
                  className="recovery-code"
                  aria-label="復旧コード"
                  readOnly
                  value={secret.code}
                  onClick={(e) => e.currentTarget.select()}
                />
              </label>
              <button
                className="outline"
                onClick={() =>
                  void work(async () => {
                    try {
                      await navigator.clipboard.writeText(secret.code);
                      setMessage("復旧コードをコピーしました");
                    } catch {
                      secretField.current?.focus();
                      secretField.current?.select();
                      setMessage(
                        "コードを選択しました。コピーして安全な場所に保存してください",
                      );
                    }
                  })
                }
              >
                <Copy size={16} />
                コードをコピー
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  announceSessionChange();
                }}
              >
                <label className="privacy-check">
                  <input type="checkbox" required />
                  <span>復旧コードを安全な場所に控えました</span>
                </label>
                <button className="primary full">
                  WALKに戻る
                  <ArrowRight size={17} />
                </button>
              </form>
            </>
          ) : (
            <>
              {screen !== "manage" && screen !== "register" && !authOnly && (
                <button
                  className="text-button account-back"
                  onClick={() =>
                    change(status?.registered ? "manage" : "register")
                  }
                >
                  <ArrowLeft size={15} />
                  戻る
                </button>
              )}
              <h2>{header}</h2>
              {screen === "register" && (
                <>
                  <p>
                    今のプロフィール・投稿・保存・足あとをそのままアカウントに引き継ぎます。別の端末でも同じWALKを使えるようになります。
                  </p>
                  <div className="account-benefits">
                    <span>
                      <ShieldCheck size={16} />
                      今の記録を保持
                    </span>
                    <span>
                      <KeyRound size={16} />
                      別端末でログイン
                    </span>
                  </div>
                </>
              )}
              {screen === "login" && (
                <p>
                  登録したログインIDとパスワードで戻れます。ゲストの記録がある場合は、先にそのゲストを登録してください。別アカウントの記録へ自動で統合しません。
                </p>
              )}
              {screen === "recover" && (
                <p>
                  復旧コードと新しいパスワードを使います。復旧すると他の端末はログアウトし、新しい復旧コードを発行します。
                </p>
              )}
              {screen === "sessions" && (
                <p>
                  パスワードを確認して、他の端末のログインを終了します。この端末は再接続します。
                </p>
              )}
              {screen === "credentials" && (
                <p>
                  今のパスワードを確認して更新します。他の端末はログアウトし、復旧コードも新しくなります。
                </p>
              )}
              {screen === "manage" ? (
                <>
                  <div className="account-identity">
                    <strong>@{status?.handle}</strong>
                    <span>{status?.sessions || 1}件のログイン</span>
                  </div>
                  <div className="account-menu">
                    <button onClick={() => change("credentials")}>
                      <KeyRound size={18} />
                      <span>パスワード・復旧コードを更新</span>
                      <ArrowRight size={16} />
                    </button>
                    <button onClick={() => change("sessions")}>
                      <LogOut size={18} />
                      <span>他の端末をログアウト</span>
                      <ArrowRight size={16} />
                    </button>
                    <button onClick={() => change("export")}>
                      <Download size={18} />
                      <span>自分のデータを取得</span>
                      <ArrowRight size={16} />
                    </button>
                    <button onClick={() => setLegal(true)}>
                      <ShieldCheck size={18} />
                      <span>利用ルール・プライバシー</span>
                      <ArrowRight size={16} />
                    </button>
                    <button
                      onClick={() =>
                        void work(async () => {
                          await api("/account/logout", "POST", {});
                          await replaceNativeSession();
                          announceSessionChange(false);
                        })
                      }
                    >
                      <LogOut size={18} />
                      <span>この端末からログアウト</span>
                    </button>
                    <button className="danger" onClick={() => change("delete")}>
                      <Trash2 size={18} />
                      <span>アカウントとデータを削除</span>
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={(e) => void submit(e)} key={screen}>
                  {["register", "login", "recover"].includes(screen) && (
                    <label>
                      ログインID
                      <input
                        aria-label="ログインID"
                        name="handle"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        pattern="[a-zA-Z0-9_]{3,32}"
                        minLength={3}
                        maxLength={32}
                        placeholder="例：walk_traveler"
                        required
                      />
                      <small>
                        表示名とは別のIDです。半角英数字・_で3〜32文字。
                      </small>
                    </label>
                  )}
                  {screen === "recover" && (
                    <label>
                      復旧コード
                      <input
                        name="recoveryCode"
                        aria-label="登録時の復旧コード"
                        autoComplete="off"
                        autoCapitalize="none"
                        required
                        maxLength={100}
                      />
                    </label>
                  )}
                  {(["register", "login", "recover", "credentials"].includes(
                    screen,
                  ) ||
                    (status?.registered &&
                      ["export", "delete", "sessions"].includes(screen))) &&
                    passwordField(
                      screen === "credentials"
                        ? "現在のパスワード"
                        : screen === "recover"
                          ? "新しいパスワード"
                          : "パスワード",
                      "password",
                      screen === "register" || screen === "recover"
                        ? "new-password"
                        : "current-password",
                      screen === "register" || screen === "recover"
                        ? 10
                        : undefined,
                    )}
                  {screen === "credentials" &&
                    passwordField(
                      "新しいパスワード",
                      "newPassword",
                      "new-password",
                      10,
                    )}
                  {["register", "recover", "credentials"].includes(screen) &&
                    passwordField(
                      "パスワードをもう一度",
                      "confirmPassword",
                      "new-password",
                      10,
                    )}
                  {screen === "register" && (
                    <>
                      <small>
                        パスワードは10〜128文字。忘れた時のために、登録後の復旧コードを必ず控えてください。
                      </small>
                      <label className="privacy-check">
                        <input name="accepted" type="checkbox" required />
                        <span>
                          {config?.ready
                            ? "利用規約とプライバシー方針を確認し同意します"
                            : "開発版の利用ルール・プライバシー案内を確認しました"}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setLegal(true)}
                      >
                        利用ルールとプライバシーを読む
                      </button>
                    </>
                  )}
                  {screen === "export" && (
                    <p>
                      プロフィール、投稿、保存、リアクション、送信メッセージ、活動・メモなどをJSONで取得します。画像・動画ファイルは含みません。保存したファイルは自分で安全に管理してください。
                    </p>
                  )}
                  {screen === "delete" && (
                    <>
                      <p className="deletion-warning">
                        このユーザーの投稿・保存・足あと・個人ルーム・添付ファイルと、関連するチャット・交流関係を削除します。相手の画面からも該当する会話が消えます。元に戻せません。
                      </p>
                      <label>
                        確認のため「削除」と入力
                        <input
                          name="confirm"
                          aria-label="削除の確認"
                          pattern="削除"
                          required
                          autoComplete="off"
                        />
                      </label>
                    </>
                  )}
                  <button
                    className={
                      "primary full " +
                      (screen === "delete" ? "danger-button" : "")
                    }
                    disabled={busy || (screen === "register" && !config)}
                  >
                    {busy
                      ? "確認しています…"
                      : screen === "register"
                        ? "このゲストをアカウント登録"
                        : screen === "login"
                          ? "ログイン"
                          : screen === "recover"
                            ? "復旧してパスワードを更新"
                            : screen === "credentials"
                              ? "認証情報を更新"
                              : screen === "export"
                                ? "データを保存"
                                : screen === "sessions"
                                  ? "他の端末をログアウト"
                                  : "データの削除を実行"}
                    <ArrowRight size={17} />
                  </button>
                </form>
              )}
              {!status?.registered && (
                <div className="account-switch">
                  {screen !== "register" && !authOnly && (
                    <button onClick={() => change("register")}>
                      今のゲストを登録する
                    </button>
                  )}
                  {screen !== "login" && (
                    <button onClick={() => change("login")}>
                      登録済みのアカウントでログイン
                    </button>
                  )}
                  {screen !== "recover" && (
                    <button onClick={() => change("recover")}>
                      パスワードを忘れた・復旧コードで戻る
                    </button>
                  )}
                  {!authOnly && screen === "register" && (
                    <>
                      <button onClick={() => change("export")}>
                        ゲストのデータを取得
                      </button>
                      <button
                        className="danger"
                        onClick={() => change("delete")}
                      >
                        このゲストのデータを削除
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="account-message" role="status">
              <Check size={16} />
              {message}
            </p>
          )}
        </div>
      </Modal>
      {legal && <Legal close={() => setLegal(false)} />}
    </>
  );
}
