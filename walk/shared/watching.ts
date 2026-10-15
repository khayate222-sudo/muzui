import type { PublicUser } from "./community";
export type Playback = {
  position: number;
  playing: boolean;
  updatedAt: number;
  revision: number;
};
export type WatchingGroup = {
  id: string;
  hostId: string;
  postId: string;
  members: PublicUser[];
  playback: Playback;
};
export type WatchingInvite = {
  id: string;
  groupId: string;
  from: PublicUser;
  post: { id: string; title: string };
  expiresAt: number;
};
export type WatchingState = {
  group: WatchingGroup | null;
  invites: WatchingInvite[];
  serverNow: number;
  notice?: string;
};
export function playbackPosition(
  playback: Playback,
  serverNow: number,
  duration = Infinity,
) {
  return Math.max(
    0,
    Math.min(
      duration,
      playback.position +
        (playback.playing
          ? Math.max(0, serverNow - playback.updatedAt) / 1000
          : 0),
    ),
  );
}
