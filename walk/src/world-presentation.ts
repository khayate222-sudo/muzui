import type { Place } from "../shared/worlds";
const stories: Record<
  string,
  { edition: string; subtitle: string; detail: string }
> = {
  "world:discovery": {
    edition: "THE OPEN COMMONS",
    subtitle: "いつもの日にも、発見は落ちている。",
    detail:
      "駅の先に広がる小さな広場。散歩の途中の一枚や、今日のいいことを持ち寄る。何かに詳しくなくても、ここから歩き出せます。",
  },
  "world:video": {
    edition: "THE LITTLE SCREEN",
    subtitle: "立ち止まりたくなる、一場面。",
    detail:
      "青い屋根の小さな映像館。短い動画も、じっくり見る一本も。同じ投稿を開いている人と、気になる場面を見つけよう。",
  },
  "world:meme": {
    edition: "A SMALL DETOUR",
    subtitle: "くだらないことほど、分かち合いたい。",
    detail:
      "緑に隠れた丸い洞窟。思わず笑ったこと、ちょっとした共感。気軽に寄り道できる小さな隠れ家です。",
  },
  "activity:gym": {
    edition: "BODY IN MOTION",
    subtitle: "現実で、ひと汗かいてくる。",
    detail:
      "運動するときの分身が過ごす部屋。終了時刻まで活動を残せます。自己申告の記録で、WALKのオンラインや動画の閲覧とは別に表示します。",
  },
  "activity:study": {
    edition: "A QUIET CHAPTER",
    subtitle: "現実で、集中する時間。",
    detail:
      "勉強や読書の時間を自分で決めて残す学校。終わったら今日の足あとへ。活動の記録は非公開が基本です。",
  },
  "activity:social": {
    edition: "AROUND THE TABLE",
    subtitle: "現実で、誰かと囲むテーブル。",
    detail:
      "現実の交流を自己申告で残す場所。誰とどこにいるかを自動追跡しません。終了時刻や共有範囲は自分で決められます。",
  },
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
    edition: "THE PLAY COURTYARD",
    subtitle: "冒険の入口は、青い屋根の向こう。",
    detail:
      "青い塔のゲームの城から、RPGの洞窟へ。その先には、住人の物語を語れる静かな工房があります。",
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
