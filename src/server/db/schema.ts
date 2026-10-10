import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Policy, PolicyOverrides } from "../review/policy";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  githubId: text("githubId"),
  githubLogin: text("githubLogin"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
  ],
);

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (authenticator) => [primaryKey({ columns: [authenticator.userId, authenticator.credentialID] })],
);

export const organizations = pgTable("organization", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  githubAccountId: text("github_account_id").notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const installations = pgTable("installation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  githubInstallationId: text("github_installation_id").notNull().unique(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const installationAccess = pgTable(
  "installation_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.installationId] })],
);

export const policies = pgTable("policy", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  document: jsonb("document").$type<Policy>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repositories = pgTable("repository", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  installationId: text("installation_id")
    .notNull()
    .references(() => installations.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  githubRepoId: text("github_repo_id").notNull().unique(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  private: boolean("private").notNull().default(false),
  enabled: boolean("enabled").notNull().default(false),
  policyMode: text("policy_mode").$type<"inherit" | "override">().notNull().default("inherit"),
  overrides: jsonb("overrides").$type<PolicyOverrides | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewRuns = pgTable(
  "review_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    pullNumber: integer("pull_number").notNull(),
    headSha: text("head_sha").notNull(),
    baseSha: text("base_sha"),
    prTitle: text("pr_title"),
    prUrl: text("pr_url"),
    status: text("status")
      .$type<"queued" | "running" | "completed" | "skipped" | "failed" | "rate_limited">()
      .notNull()
      .default("queued"),
    skipReason: text("skip_reason"),
    summary: text("summary"),
    reviewEvent: text("review_event"),
    githubReviewId: text("github_review_id"),
    checkRunId: text("check_run_id"),
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    estimatedCostUsd: doublePrecision("estimated_cost_usd"),
    error: text("error"),
    dryRun: boolean("dry_run").notNull().default(false),
    policySnapshot: jsonb("policy_snapshot").$type<Policy | null>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("review_run_live_head_unique")
      .on(table.repositoryId, table.pullNumber, table.headSha)
      .where(sql`${table.dryRun} = false`),
  ],
);

export const findings = pgTable("finding", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  reviewRunId: text("review_run_id")
    .notNull()
    .references(() => reviewRuns.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  line: integer("line").notNull(),
  side: text("side").notNull().default("RIGHT"),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  confidence: integer("confidence").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  suggestion: text("suggestion"),
  signature: text("signature").notNull(),
  githubCommentId: text("github_comment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppressions = pgTable("suppression", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  signature: text("signature"),
  path: text("path"),
  line: integer("line"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_delivery", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  action: text("action"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgSecrets = pgTable(
  "org_secret",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("org_secret_provider_unique").on(table.organizationId, table.provider)],
);

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  installations: many(installations),
  repositories: many(repositories),
  policy: one(policies, { fields: [organizations.id], references: [policies.organizationId] }),
}));

export const installationsRelations = relations(installations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [installations.organizationId],
    references: [organizations.id],
  }),
  repositories: many(repositories),
}));

export const reviewRunsRelations = relations(reviewRuns, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [reviewRuns.repositoryId],
    references: [repositories.id],
  }),
  findings: many(findings),
}));
