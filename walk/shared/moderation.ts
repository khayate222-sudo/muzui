export type ModerationReport = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: number;
  status: "open" | "resolved" | "dismissed";
  moderationNote: string;
  resolvedAt: number | null;
  targetLabel: string;
  targetUserId: string | null;
  suspended: boolean;
};
