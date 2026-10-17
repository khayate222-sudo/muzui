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
  targetDeleted: boolean;
  targetUserId: string | null;
  suspended: boolean;
};
