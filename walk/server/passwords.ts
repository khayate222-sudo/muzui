import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-32768-8-1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
// Fixed format and work factor prevent database text from choosing unbounded work.
export async function verifyPassword(password: string, encoded: string) {
  const match = /^scrypt-32768-8-1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(
    encoded,
  );
  if (!match) return false;
  return timingSafeEqual(
    await derive(password, match[1]),
    Buffer.from(match[2], "hex"),
  );
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const recoveryCode = () =>
  randomBytes(20)
    .toString("hex")
    .match(/.{1,5}/g)!
    .join("-");
export const recoveryDigest = (code: string) =>
  digest("walk-recovery:" + code.replace(/-/g, "").toLowerCase());
export const sameDigest = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export const dummyPassword = hashPassword(randomBytes(32).toString("hex"));
