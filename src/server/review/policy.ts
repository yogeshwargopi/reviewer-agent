import { z } from "zod";

export const SEVERITIES = ["nit", "minor", "major", "blocker"] as const;
export const CATEGORIES = [
  "bugs",
  "security",
  "performance",
  "tests",
  "apiContracts",
  "maintainability",
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type BlockingMode = "comment" | "request_changes";
export type ModelProvider = "openai" | "anthropic";

export const CATEGORY_LABELS: Record<Category, string> = {
  bugs: "Bugs",
  security: "Security",
  performance: "Performance",
  tests: "Tests",
  apiContracts: "API contracts",
  maintainability: "Maintainability",
};

export const SEVERITY_RANK: Record<Severity, number> = {
  nit: 0,
  minor: 1,
  major: 2,
  blocker: 3,
};

const focusSchema = z.object({
  bugs: z.boolean(),
  security: z.boolean(),
  performance: z.boolean(),
  tests: z.boolean(),
  apiContracts: z.boolean(),
  maintainability: z.boolean(),
});

const triggersSchema = z.object({
  opened: z.boolean(),
  synchronize: z.boolean(),
  reopened: z.boolean(),
  readyForReview: z.boolean(),
});

export const policySchema = z.object({
  focus: focusSchema,
  playbook: z.string().max(8000),
  includeGlobs: z.array(z.string().max(200)).max(50),
  excludeGlobs: z.array(z.string().max(200)).max(80),
  minSeverity: z.enum(SEVERITIES),
  confidenceFloor: z.number().int().min(0).max(100),
  maxComments: z.number().int().min(1).max(30),
  blockingMode: z.enum(["comment", "request_changes"]),
  modelProvider: z.enum(["openai", "anthropic"]),
  modelId: z.string().min(1).max(80),
  triggers: triggersSchema,
});

export type Policy = z.infer<typeof policySchema>;

export type FindingDraft = {
  path: string;
  line: number;
  severity: Severity;
  category: Category;
  confidence: number;
  title: string;
  body: string;
  suggestion: string;
};

export type PolicyOverrides = {
  focus?: Partial<Policy["focus"]>;
  playbook?: string;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  minSeverity?: Severity;
  confidenceFloor?: number;
  maxComments?: number;
  blockingMode?: BlockingMode;
  modelProvider?: ModelProvider;
  modelId?: string;
  triggers?: Partial<Policy["triggers"]>;
};

export const DEFAULT_EXCLUDE_GLOBS = [
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  "**/bun.lock",
  "**/bun.lockb",
  "**/*.min.js",
  "**/*.min.css",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/generated/**",
  "**/*.generated.*",
  "**/*.gen.ts",
];

export const DEFAULT_POLICY: Policy = {
  focus: {
    bugs: true,
    security: true,
    performance: true,
    tests: true,
    apiContracts: true,
    maintainability: true,
  },
  playbook: "",
  includeGlobs: [],
  excludeGlobs: DEFAULT_EXCLUDE_GLOBS,
  minSeverity: "major",
  confidenceFloor: 60,
  maxComments: 8,
  blockingMode: "comment",
  modelProvider: "openai",
  modelId: "gpt-6-luna",
  triggers: {
    opened: true,
    synchronize: true,
    reopened: true,
    readyForReview: true,
  },
};

export const MODEL_OPTIONS = [
  { provider: "openai" as const, id: "gpt-6-luna", label: "OpenAI · GPT-6 Luna" },
  { provider: "openai" as const, id: "gpt-4.1-mini", label: "OpenAI · GPT-4.1 mini" },
  { provider: "openai" as const, id: "gpt-4.1", label: "OpenAI · GPT-4.1" },
  { provider: "anthropic" as const, id: "claude-sonnet-4-5", label: "Anthropic · Claude Sonnet 4.5" },
  { provider: "anthropic" as const, id: "claude-haiku-4-5", label: "Anthropic · Claude Haiku 4.5" },
];

export function resolvePolicy(
  base: Policy,
  mode: "inherit" | "override",
  overrides: PolicyOverrides | null | undefined,
): Policy {
  if (mode !== "override" || !overrides) return base;
  return policySchema.parse({
    ...base,
    ...defined(overrides),
    focus: { ...base.focus, ...overrides.focus },
    triggers: { ...base.triggers, ...overrides.triggers },
  });
}

function defined(overrides: PolicyOverrides): Partial<Policy> {
  const next: Partial<Policy> = {};
  if (overrides.playbook != null) next.playbook = overrides.playbook;
  if (overrides.includeGlobs != null) next.includeGlobs = overrides.includeGlobs;
  if (overrides.excludeGlobs != null) next.excludeGlobs = overrides.excludeGlobs;
  if (overrides.minSeverity != null) next.minSeverity = overrides.minSeverity;
  if (overrides.confidenceFloor != null) next.confidenceFloor = overrides.confidenceFloor;
  if (overrides.maxComments != null) next.maxComments = overrides.maxComments;
  if (overrides.blockingMode != null) next.blockingMode = overrides.blockingMode;
  if (overrides.modelProvider != null) next.modelProvider = overrides.modelProvider;
  if (overrides.modelId != null) next.modelId = overrides.modelId;
  return next;
}

export function parsePolicyDocument(value: unknown): Policy {
  const parsed = policySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_POLICY;
}

export function parseOverrides(value: unknown): PolicyOverrides | null {
  if (!value || typeof value !== "object") return null;
  return value as PolicyOverrides;
}

export function policyFromForm(formData: FormData): Policy {
  const modelValue = String(formData.get("model") ?? "");
  const [providerRaw, ...idParts] = modelValue.split(":");
  const modelProvider = providerRaw === "anthropic" ? "anthropic" : "openai";
  const modelId = idParts.join(":") || DEFAULT_POLICY.modelId;
  return policySchema.parse({
    focus: {
      bugs: formData.get("focus_bugs") === "on",
      security: formData.get("focus_security") === "on",
      performance: formData.get("focus_performance") === "on",
      tests: formData.get("focus_tests") === "on",
      apiContracts: formData.get("focus_apiContracts") === "on",
      maintainability: formData.get("focus_maintainability") === "on",
    },
    playbook: String(formData.get("playbook") ?? ""),
    includeGlobs: globLines(formData.get("includeGlobs")),
    excludeGlobs: globLines(formData.get("excludeGlobs")),
    minSeverity: formData.get("minSeverity") || "major",
    confidenceFloor: Number(formData.get("confidenceFloor") ?? 60),
    maxComments: Number(formData.get("maxComments") ?? 8),
    blockingMode: formData.get("blockingMode") === "request_changes" ? "request_changes" : "comment",
    modelProvider,
    modelId,
    triggers: {
      opened: formData.get("trigger_opened") === "on",
      synchronize: formData.get("trigger_synchronize") === "on",
      reopened: formData.get("trigger_reopened") === "on",
      readyForReview: formData.get("trigger_readyForReview") === "on",
    },
  });
}

export function globLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export type ReviewDecision =
  | { action: "ignore" }
  | { action: "skip"; reason: string }
  | { action: "review" };

export function decideReview(input: {
  action: string;
  draft: boolean;
  enabled: boolean;
  suspended: boolean;
  labels: string[];
  triggers: Policy["triggers"];
  force: boolean;
}): ReviewDecision {
  if (input.suspended) return { action: "skip", reason: "GitHub App installation is suspended" };
  if (input.force) return { action: "review" };
  if (!input.enabled) return { action: "ignore" };
  if (input.draft) return { action: "skip", reason: "Draft pull requests are skipped" };
  if (input.labels.some((label) => label.toLowerCase() === "skip-review")) {
    return { action: "skip", reason: "Labeled skip-review" };
  }
  const triggers: Record<string, keyof Policy["triggers"] | undefined> = {
    opened: "opened",
    synchronize: "synchronize",
    reopened: "reopened",
    ready_for_review: "readyForReview",
  };
  const key = triggers[input.action];
  if (!key || !input.triggers[key]) return { action: "ignore" };
  return { action: "review" };
}
