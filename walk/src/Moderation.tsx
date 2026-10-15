import { useEffect, useState, type FormEvent } from "react";
import { ShieldAlert, Check, Undo2 } from "lucide-react";
import type { ModerationReport } from "../shared/moderation";
import { api } from "./api";
import Account from "./Account";
import Legal from "./Legal";
import type { AccountSummary } from "../shared/accounts";
export function SuspendedGate({ account }: { account: AccountSummary }) {
  const [settings, setSettings] = useState(false),
    [legal, setLegal] = useState(false);
  return (
    <>
      <main className="auth-gate">
        <span className="brand">
          <span className="brand-mark">w</span>walk
        </span>
        <ShieldAlert size={36} />
        <h1>アカウントの利用を停止しています。</h1>
        <p>{account.suspension?.reason}</p>
        <p>
          自分のデータの取得・削除やログアウトは、アカウント設定から行えます。お問い合わせ先は案内をご確認ください。
        </p>
        <button className="primary full" onClick={() => setSettings(true)}>
          アカウントとデータ
        </button>
        <button className="outline full" onClick={() => setLegal(true)}>
          問い合わせ先・利用ルール
        </button>
        <button className="text-button" onClick={() => location.reload()}>
          状態を再確認する
        </button>
      </main>
      {settings && <Account close={() => setSettings(false)} />}
      {legal && <Legal close={() => setLegal(false)} />}
    </>
  );
}
export default function ModerationQueue({
  notify,
  refresh,
}: {
  notify: (s: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const [reports, setReports] = useState<ModerationReport[]>([]),
    [filter, setFilter] = useState("open"),
    [editing, setEditing] = useState<{
      report: ModerationReport;
      action: "resolve" | "dismiss" | "reopen" | "suspend" | "restore";
    } | null>(null),
    [busy, setBusy] = useState(false);
  const load = async () =>
    setReports(await api<ModerationReport[]>("/admin/reports"));
  useEffect(() => {
    void api<ModerationReport[]>("/admin/reports")
      .then(setReports)
      .catch((e) => notify(e.message));
  }, [notify]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const note = String(new FormData(e.currentTarget).get("note") || "");
    setBusy(true);
    try {
      const { report: r, action } = editing;
      if (action === "suspend" || action === "restore")
        await api("/admin/users/" + r.targetUserId + "/moderation", "POST", {
          suspended: action === "suspend",
          reason: note,
        });
      else
        await api("/admin/reports/" + r.id, "PATCH", {
          status:
            action === "reopen"
              ? "open"
              : action === "resolve"
                ? "resolved"
                : "dismissed",
          note,
        });
      await load();
      await refresh();
      setEditing(null);
      notify("対応を記録しました");
    } catch (e) {
      notify(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-reports moderation-queue">
      <h3>
        通報と対応{" "}
        <span>
          {reports.filter((r) => r.status === "open").length}件 未対応
        </span>
      </h3>
      <div className="filter-tabs">
        {[
          ["open", "未対応"],
          ["all", "すべて"],
        ].map(([v, label]) => (
          <button
            key={v}
            className={filter === v ? "selected" : ""}
            onClick={() => setFilter(v)}
          >
            {label}
          </button>
        ))}
        <button onClick={() => void load().catch((e) => notify(e.message))}>
          更新する
        </button>
      </div>
      {reports
        .filter((r) => filter === "all" || r.status === "open")
        .map((r) => (
          <article key={r.id}>
            <span className="moderation-status">
              {r.status === "open"
                ? "未対応"
                : r.status === "resolved"
                  ? "対応済み"
                  : "対応不要"}{" "}
              · {r.targetType === "post" ? "投稿" : "ユーザー"}
            </span>
            <h4>{r.targetLabel}</h4>
            <p>{r.reason}</p>
            <small>
              {new Date(r.createdAt).toLocaleString("ja-JP")} · 通報者{" "}
              {r.reporterId.slice(0, 8)}
            </small>
            {r.moderationNote && (
              <p className="moderation-note">対応メモ：{r.moderationNote}</p>
            )}
            <div className="moderation-actions">
              {r.status === "open" ? (
                <>
                  <button
                    className="outline"
                    onClick={() => setEditing({ report: r, action: "resolve" })}
                  >
                    <Check size={15} />
                    対応済みにする
                  </button>
                  <button
                    className="outline"
                    onClick={() => setEditing({ report: r, action: "dismiss" })}
                  >
                    対応不要
                  </button>
                </>
              ) : (
                <button
                  className="outline"
                  onClick={() => setEditing({ report: r, action: "reopen" })}
                >
                  <Undo2 size={15} />
                  再確認する
                </button>
              )}
              {r.targetUserId && (
                <button
                  className="outline"
                  onClick={() =>
                    setEditing({
                      report: r,
                      action: r.suspended ? "restore" : "suspend",
                    })
                  }
                >
                  <ShieldAlert size={15} />
                  {r.suspended ? "利用停止を解除" : "対象ユーザーを利用停止"}
                </button>
              )}
            </div>
          </article>
        ))}
      {!reports.filter((r) => filter === "all" || r.status === "open")
        .length && <p className="muted">該当する通報はありません。</p>}
      {editing && (
        <form className="moderation-edit" onSubmit={(e) => void submit(e)}>
          <h4>
            {editing.action === "suspend"
              ? "利用を停止する"
              : editing.action === "restore"
                ? "利用停止を解除する"
                : "通報への対応を記録する"}
          </h4>
          <p>{editing.report.targetLabel}</p>
          {editing.action === "suspend" && (
            <p>
              このユーザーの接続を切断し、投稿・ルームを非表示にして、閲覧・投稿・交流を停止します。データは削除せず、後で解除できます。
            </p>
          )}
          <label>
            {editing.action === "suspend" || editing.action === "restore"
              ? "本人に示す理由"
              : "対応メモ"}
            <textarea name="note" minLength={3} maxLength={1000} required />
          </label>
          <div className="form-row">
            <button
              type="button"
              className="outline"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              取消
            </button>
            <button className="primary" disabled={busy}>
              対応を確定する
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
