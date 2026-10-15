import { releaseProblems } from "../shared/release";
const problems = releaseProblems(process.env);
if (problems.length) {
  for (const p of problems) console.error(p);
  process.exitCode = 1;
} else
  console.log(
    "公開用の運営者・規約・HTTPS設定を確認しました。実機検証、署名、審査は別途必要です。",
  );
