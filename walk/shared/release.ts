export type LegalConfiguration = {
  operator: string;
  supportEmail: string;
  termsUrl: string;
  privacyUrl: string;
  policyVersion: string;
  ready: boolean;
};
const https = (v: string) => {
  try {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    );
  } catch {
    return false;
  }
};
export function legalConfiguration(
  env: Record<string, string | undefined>,
): LegalConfiguration {
  const config = {
    operator: (env.WALK_OPERATOR_NAME || "").trim(),
    supportEmail: (env.WALK_SUPPORT_EMAIL || "").trim(),
    termsUrl: (env.WALK_TERMS_URL || "").trim(),
    privacyUrl: (env.WALK_PRIVACY_URL || "").trim(),
    policyVersion: (env.WALK_POLICY_VERSION || "").trim(),
  };
  return {
    ...config,
    termsUrl: https(config.termsUrl) ? config.termsUrl : "",
    privacyUrl: https(config.privacyUrl) ? config.privacyUrl : "",
    policyVersion: config.policyVersion || "development-2026-10",
    ready:
      !!config.operator &&
      config.operator.length <= 160 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail) &&
      https(config.termsUrl) &&
      https(config.privacyUrl) &&
      !!config.policyVersion &&
      config.policyVersion.length <= 100 &&
      env.WALK_POLICIES_APPROVED === "true",
  };
}
export function releaseProblems(env: Record<string, string | undefined>) {
  const problems: string[] = [];
  if (!legalConfiguration(env).ready)
    problems.push(
      "運営者名、問い合わせ先、公開したHTTPSの規約・プライバシーURL、規約バージョン、運営者による内容の確認が必要です",
    );
  try {
    const u = new URL(env.APP_ORIGIN || "");
    if (!https(u.href) || u.pathname !== "/" || u.search || u.hash)
      throw new Error();
  } catch {
    problems.push("APP_ORIGINに公開HTTPSオリジンが必要です");
  }
  if (env.COOKIE_SECURE !== "true")
    problems.push("COOKIE_SECURE=trueが必要です");
  return problems;
}
