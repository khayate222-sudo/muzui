import type { Place } from "../shared/worlds";
export type EmblemShape =
  | { kind: "polygon"; points: number[]; fill: string }
  | { kind: "circle"; x: number; y: number; r: number; fill: string }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
    };
// One vector vocabulary for canvas entrances and their destination cards.
// Coordinates stay inside [-32,32] so decorations do not extend past the roof hit area.
export function worldEmblem(place: Place): EmblemShape[] {
  const ink = "#fff1cf",
    dark = "#3d5368";
  if (place.genre === "music")
    return [
      { kind: "circle", x: 0, y: 0, r: 29, fill: dark },
      { kind: "circle", x: 0, y: 0, r: 21, fill: "#8e9fae" },
      { kind: "circle", x: 0, y: 0, r: 17, fill: dark },
      { kind: "circle", x: 0, y: 0, r: 9, fill: "#edb8ac" },
      { kind: "circle", x: 0, y: 0, r: 3, fill: ink },
    ];
  if (place.genre === "video")
    return [
      { kind: "rect", x: -31, y: -22, width: 62, height: 44, fill: dark },
      { kind: "polygon", points: [-9, -14, 16, 0, -9, 14], fill: "#99e7df" },
    ];
  if (place.genre === "game" && place.theme !== "fantasy")
    return [
      {
        kind: "polygon",
        points: [
          -24, -16, 24, -16, 32, 16, 24, 23, 10, 11, -10, 11, -24, 23, -32, 16,
        ],
        fill: dark,
      },
      { kind: "rect", x: -21, y: -6, width: 18, height: 6, fill: "#a1e6e4" },
      { kind: "rect", x: -15, y: -12, width: 6, height: 18, fill: "#a1e6e4" },
      { kind: "circle", x: 15, y: -5, r: 4, fill: "#e8b2d0" },
      { kind: "circle", x: 23, y: 3, r: 4, fill: "#e4cc8c" },
    ];
  if (place.genre === "art")
    return [
      { kind: "circle", x: 0, y: 0, r: 29, fill: ink },
      { kind: "circle", x: -14, y: -8, r: 6, fill: "#8dbba1" },
      { kind: "circle", x: 1, y: -17, r: 6, fill: "#c5a2c5" },
      { kind: "circle", x: 16, y: -6, r: 6, fill: "#e7b077" },
      { kind: "circle", x: 6, y: 13, r: 7, fill: dark },
    ];
  if (place.genre === "anime" || place.theme === "fantasy")
    return [
      {
        kind: "polygon",
        points: [
          0, -31, 9, -10, 31, -10, 15, 5, 21, 29, 0, 16, -21, 29, -15, 5, -31,
          -10, -9, -10,
        ],
        fill: ink,
      },
      { kind: "circle", x: 0, y: -1, r: 6, fill: "#b497be" },
    ];
  if (place.genre === "meme")
    return [
      {
        kind: "polygon",
        points: [-30, -22, 30, -22, 30, 16, 5, 16, -13, 30, -13, 16, -30, 16],
        fill: ink,
      },
      { kind: "circle", x: -15, y: -3, r: 4, fill: dark },
      { kind: "circle", x: 0, y: -3, r: 4, fill: dark },
      { kind: "circle", x: 15, y: -3, r: 4, fill: dark },
    ];
  if (place.id === "activity:gym")
    return [
      { kind: "rect", x: -27, y: -6, width: 54, height: 12, fill: ink },
      { kind: "rect", x: -30, y: -20, width: 12, height: 40, fill: dark },
      { kind: "rect", x: 18, y: -20, width: 12, height: 40, fill: dark },
    ];
  if (place.id === "activity:study")
    return [
      {
        kind: "polygon",
        points: [
          -30, -22, -2, -17, 0, -11, 2, -17, 30, -22, 30, 21, 2, 26, 0, 21, -2,
          26, -30, 21,
        ],
        fill: ink,
      },
      { kind: "rect", x: -2, y: -13, width: 4, height: 34, fill: "#91b7ad" },
    ];
  if (place.id === "activity:social")
    return [
      { kind: "rect", x: -19, y: -20, width: 36, height: 44, fill: ink },
      { kind: "rect", x: 17, y: -12, width: 12, height: 8, fill: ink },
      { kind: "rect", x: 21, y: -9, width: 8, height: 24, fill: ink },
      { kind: "rect", x: 17, y: 12, width: 12, height: 8, fill: ink },
      { kind: "rect", x: -11, y: -10, width: 7, height: 26, fill: "#c6a378" },
    ];
  return [
    {
      kind: "polygon",
      points: [
        0, -30, 10, -10, 30, 0, 10, 10, 0, 30, -10, 10, -30, 0, -10, -10,
      ],
      fill: ink,
    },
    { kind: "circle", x: 0, y: 0, r: 7, fill: "#8fae9b" },
  ];
}
