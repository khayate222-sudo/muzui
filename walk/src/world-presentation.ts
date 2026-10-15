import type { Place } from "../shared/worlds";
const stories: Record<
  string,
  { edition: string; subtitle: string; detail: string }
> = {
  public: {
    edition: "THE BETWEEN STATION",
    subtitle: "ここは、好きな世界への乗換駅。",
    detail:
      "行き先のない切符を一枚。時計台の下から、和の音楽街、光るゲームの城、緑の工房へ。気になる建物全体が入口です。",
  },
  "world:music": {
    edition: "AFTER HOURS",
    subtitle: "路地に、まだ知らない音がある。",
    detail:
      "夕暮れの木造街と小さな灯り。お気に入りの一曲を持ち寄って、その先の演奏の家へ。",
  },
  "world:game": {
    edition: "NEON PLAYGROUND",
    subtitle: "冒険の入口は、ネオンの向こう。",
    detail:
      "未来のアーケードから、RPGの洞窟へ。その先には、住人の物語を語れる静かな工房があります。",
  },
  "world:art": {
    edition: "OPEN AIR ATELIER",
    subtitle: "つくる途中も、ひとつの作品。",
    detail:
      "緑に囲まれた屋外アトリエ。完成した絵も、描きかけの一枚も。好きな表現に立ち止まれる場所。",
  },
  "world:anime": {
    edition: "SAKURA FRAME",
    subtitle: "あの一瞬を、何度でも語ろう。",
    detail:
      "桜の路地で、作品や場面を持ち寄る。奥の工房では、作画や演出の話をもっと深く。",
  },
  "world:game-rpg": {
    edition: "THE QUIET QUEST",
    subtitle: "急がない冒険が、ここにある。",
    detail:
      "石と光の小さな隠れ家。物語、育成、探索。同じ冒険が好きな人と、ゆっくり話そう。",
  },
};
export function worldPresentation(place?: Place) {
  return (
    stories[place?.id || ""] || {
      edition: place?.id.startsWith("activity:")
        ? "LIFE, ELSEWHERE"
        : place?.theme === "fantasy"
          ? "BEYOND THE GATE"
          : place?.theme === "future"
            ? "LIGHT & DISCOVERY"
            : "A WORLD OF YOUR OWN",
      subtitle: place?.description || "好きなものを持ち寄る、小さな世界。",
      detail: place?.description || "住人が配置した投稿を楽しむ部屋。",
    }
  );
}
