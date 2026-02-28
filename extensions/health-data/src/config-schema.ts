import { z } from "zod";

export const HealthDataConfigSchema = z.object({
  enabled: z.boolean().default(true),
  rookWebhookPath: z.string().default("/health/rook"),
  appleHealthWebhookPath: z.string().default("/health/apple"),
  webhookSecret: z.string(),
  octaviousApiUrl: z.string(),
});

export type HealthDataConfig = z.infer<typeof HealthDataConfigSchema>;
