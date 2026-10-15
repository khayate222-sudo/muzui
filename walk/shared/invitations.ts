export type Invitation = { kind: "world" | "post"; id: string };
// A fragment stays on our origin. It never becomes a redirect or an arbitrary API path.
export function readInvitation(hash: string): Invitation | null {
  const match = /^#\/(world|post)\/([^/?#]+)$/.exec(hash);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[2]);
    return /^[a-zA-Z0-9:_-]{1,120}$/.test(id)
      ? { kind: match[1] as Invitation["kind"], id }
      : null;
  } catch {
    return null;
  }
}
export function invitationUrl(origin: string, target: Invitation) {
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("共有先のURLを確認できません");
  url.pathname = "/";
  url.search = "";
  url.hash = `/${target.kind}/${encodeURIComponent(target.id)}`;
  return url.href;
}
