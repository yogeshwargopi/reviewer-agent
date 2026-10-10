import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { AppError } from "../errors";
import type { FindingDraft, Policy } from "./policy";
import { REVIEW_SYSTEM_PROMPT } from "./prompt";

const reviewOutputSchema = z.object({
  summary: z.string(),
  findings: z
    .array(
      z.object({
        path: z.string(),
        line: z.number().int(),
        severity: z.enum(["blocker", "major", "minor", "nit"]),
        category: z.enum(["bugs", "security", "performance", "tests", "apiContracts", "maintainability"]),
        confidence: z.number().min(0).max(100),
        title: z.string(),
        body: z.string(),
        suggestion: z.string(),
      }),
    )
    .max(20),
});

export async function generateReview(policy: Policy, apiKey: string, prompt: string): Promise<{
  summary: string;
  findings: FindingDraft[];
  inputTokens: number;
  outputTokens: number;
}> {
  const model =
    policy.modelProvider === "anthropic"
      ? createAnthropic({ apiKey })(policy.modelId)
      : createOpenAI({
          apiKey,
          baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
        }).chat(policy.modelId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generateObject({
        model,
        schema: reviewOutputSchema,
        schemaName: "PullRequestReview",
        system: REVIEW_SYSTEM_PROMPT,
        prompt:
          attempt === 0
            ? prompt
            : `${prompt}\n\nThe previous response did not match the schema. Return only valid findings.`,
        maxRetries: 1,
      });
      return {
        summary: result.object.summary,
        findings: result.object.findings.map((finding) => ({
          ...finding,
          confidence: Math.round(finding.confidence),
        })),
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      };
    } catch {
      // One schema retry, then a safe error that does not include the prompt.
    }
  }
  throw new AppError("The model returned an invalid review.", false, "invalid_review");
}
