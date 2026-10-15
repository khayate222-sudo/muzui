import { z } from "zod";
import { readInvitation, type Invitation } from "./invitations";
import type { PublicUser } from "./community";
export const destinationSchema = z
  .object({ kind: z.enum(["world", "post", "room"]), id: z.string().max(120) })
  .refine(
    (d) => !!readInvitation(`#/${d.kind}/${encodeURIComponent(d.id)}`),
    "行き先を確認してください",
  );
export type DestinationInvite = {
  id: string;
  from: PublicUser;
  destination: Invitation;
  title: string;
  path: string[];
  createdAt: number;
  expiresAt: number;
};
