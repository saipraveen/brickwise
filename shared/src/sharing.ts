// Sharing domain types

/** Options for creating a shared view */
export interface ShareOptions {
  includeCollection: boolean;
  includeInventory: boolean;
  maxInvitees?: number; // default 20
}

/** A share link created by a user */
export interface ShareLink {
  id: string;
  ownerId: string;
  shareUrl: string;
  options: ShareOptions;
  createdAt: Date;
}

/** An invitation to view shared content */
export interface ShareInvite {
  id: string;
  shareId: string;
  invitedUserId: string;
  invitedUsername: string;
  invitedAt: Date;
  revokedAt?: Date;
}

/** The view presented to an invited user */
export interface SharedView {
  ownerUsername: string;
  collection?: SharedCollectionView;
  inventory?: SharedInventoryView;
}

/** Shared collection view showing sets */
export interface SharedCollectionView {
  sets: SharedSetSummary[];
}

/** Summary of a set visible in shared view */
export interface SharedSetSummary {
  setNumber: string;
  name: string;
  theme: string;
  status: 'built' | 'disassembled' | 'partial';
}

/** Shared inventory view showing brick counts */
export interface SharedInventoryView {
  totalCount: number;
  byCategory: CategoryCount[];
}

/** Brick count per category */
export interface CategoryCount {
  categoryId: number;
  categoryName: string;
  count: number;
}
