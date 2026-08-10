import { z } from "zod";

const modelBreakdownSchema = z.object({
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  cost: z.number(),
  inputTokens: z.number(),
  modelName: z.string(),
  outputTokens: z.number(),
});

const aggregateSchema = z.object({
  agent: z.string(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  inputTokens: z.number(),
  metadata: z.object({
    agents: z.array(z.string()).optional(),
    lastActivity: z.string().optional(),
    projectPath: z.string().optional(),
  }),
  modelBreakdowns: z.array(modelBreakdownSchema),
  modelsUsed: z.array(z.string()),
  outputTokens: z.number(),
  period: z.string(),
  totalCost: z.number(),
  totalTokens: z.number(),
});

const totalsSchema = z.object({
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
  totalTokens: z.number(),
});

export const blocksResponseSchema = z.object({
  blocks: z.array(
    z.object({
      burnRate: z.object({
        costPerHour: z.number(),
        tokensPerMinute: z.number(),
        tokensPerMinuteForIndicator: z.number(),
      }),
      costUSD: z.number(),
      endTime: z.string(),
      id: z.string(),
      isActive: z.boolean(),
      models: z.array(z.string()),
      projection: z.object({
        remainingMinutes: z.number(),
        totalCost: z.number(),
        totalTokens: z.number(),
      }),
      startTime: z.string(),
      tokenCounts: z.object({
        cacheCreationInputTokens: z.number(),
        cacheReadInputTokens: z.number(),
        inputTokens: z.number(),
        outputTokens: z.number(),
      }),
    }),
  ),
});

export const sessionsResponseSchema = z.object({
  session: z.array(
    aggregateSchema.extend({
      metadata: z
        .object({
          lastActivity: z.string(),
          projectPath: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export const dailyResponseSchema = z.object({
  daily: z.array(aggregateSchema),
  totals: totalsSchema,
});

export const weeklyResponseSchema = z.object({
  totals: totalsSchema,
  weekly: z.array(aggregateSchema),
});

export const monthlyResponseSchema = z.object({
  monthly: z.array(aggregateSchema),
  totals: totalsSchema,
});

export const unifiedResponseSchema = z.object({
  daily: z.array(aggregateSchema),
  monthly: z.array(aggregateSchema),
  session: z.array(
    aggregateSchema.extend({
      metadata: z
        .object({
          lastActivity: z.string().optional(),
          projectPath: z.string().optional(),
        })
        .optional(),
    }),
  ),
  weekly: z.array(aggregateSchema),
});

export type AggregateOutput = z.infer<typeof aggregateSchema>;
