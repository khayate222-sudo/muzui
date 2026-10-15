import { z } from "zod";
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,32}$/,
    "ログインIDは半角英数字と_で3〜32文字にしてください",
  );
export const passwordSchema = z
  .string()
  .min(10, "パスワードは10文字以上にしてください")
  .max(128, "パスワードは128文字までです");
export type AccountSummary = {
  registered: boolean;
  handle: string | null;
  guestHasData: boolean;
  sessions: number;
  suspension: { reason: string; since: number } | null;
};
export type AuthResult = {
  ok: true;
  token?: string;
  expiresAt: number;
  recoveryCode?: string;
  handle?: string;
};
