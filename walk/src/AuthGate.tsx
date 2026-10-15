import {WalkLogo} from "./StationIdentity";
import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import Account from "./Account";
import Legal from "./Legal";
import Modal from "./Modal";
import { api } from "./api";
import { replaceNativeSession, announceSessionChange } from "./native";
import type { AuthResult } from "../shared/accounts";
export default function AuthGate({
  message,
  expired,
}: {
  message: string;
  expired: boolean;
}) {
  const [account, setAccount] = useState(false),
    [legal, setLegal] = useState(false),
    [guest, setGuest] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function newGuest() {
    setBusy(true);
    try {
      const next = await api<AuthResult>("/auth/guest", "POST", {
        confirm: "新しいゲストを作成",
      });
      await replaceNativeSession(next.token);
      announceSessionChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できません");
      setBusy(false);
    }
  }
  return (
    <>
      <main className="auth-gate">
        <WalkLogo/>
        <span className="account-symbol">
          <KeyRound size={28} />
        </span>
        <h1>
          {expired ? "あなたのWALKへ、もう一度。" : "接続を確認しています。"}
        </h1>
        <p>{message}</p>
        {expired && (
          <>
            <p>
              登録したログインIDとパスワード、または復旧コードで記録に戻れます。新しいゲストへ自動で切り替えていません。
            </p>
            <button className="primary full" onClick={() => setAccount(true)}>
              ログイン・復旧する
              <ArrowRight size={18} />
            </button>
          </>
        )}
        <button className="outline full" onClick={() => location.reload()}>
          もう一度接続する
        </button>
        {expired && (
          <button className="text-button" onClick={() => setGuest(true)}>
            新しいゲストとして始める
          </button>
        )}
        <button className="text-button" onClick={() => setLegal(true)}>
          利用ルール・プライバシー
        </button>
      </main>
      {account && <Account authOnly close={() => setAccount(false)} />}
      {legal && <Legal close={() => setLegal(false)} />}
      {guest && (
        <Modal title="新しいゲストとして始める" close={() => setGuest(false)}>
          <div className="account-panel">
            <h2>別のゲストを作ります。</h2>
            <p>
              以前のデータは削除しません。アカウント登録済みの記録はログインで戻れます。登録していないゲストは、新しいゲストから元の記録を開くことはできません。
            </p>
            <button
              className="primary full"
              disabled={busy}
              onClick={() => void newGuest()}
            >
              新しいゲストを作成
            </button>
            {error && (
              <p role="alert" className="account-error">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
