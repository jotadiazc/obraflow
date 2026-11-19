import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const workspaceMembers = sqliteTable("workspace_members", {
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "operator"] }).notNull(),
  joinedAt: text("joined_at").notNull(),
}, (table) => ({
  member: uniqueIndex("workspace_members_workspace_user").on(table.workspaceId, table.userId),
  byUser: index("workspace_members_user_idx").on(table.userId),
}));

export const workspaceState = sqliteTable("workspace_state", {
  workspaceId: text("workspace_id").primaryKey(),
  dataJson: text("data_json"),
  version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const workspaceInvites = sqliteTable("workspace_invites", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "operator"] }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  token: uniqueIndex("workspace_invites_token_hash").on(table.tokenHash),
  byEmail: index("workspace_invites_email_idx").on(table.email),
}));

export const photoObjects = sqliteTable("photo_objects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  orderId: text("order_id").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  objectKey: uniqueIndex("photo_objects_key").on(table.objectKey),
  byOrder: index("photo_objects_workspace_order_idx").on(table.workspaceId, table.orderId),
}));
