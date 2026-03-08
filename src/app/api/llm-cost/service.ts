// src/app/api/llm-cost/service.ts
// Shared service instances for LLM cost API routes
// Uses globalThis to survive Next.js HMR reloads in dev mode

import { getDatabase } from '@/lib/memory/db'
import { LLMLoggingService, AlertService } from '@/lib/llm-cost'

const g = globalThis as unknown as {
  __llmService?: LLMLoggingService
  __alertService?: AlertService
}

export function getService(): LLMLoggingService {
  if (!g.__llmService) {
    g.__llmService = new LLMLoggingService(getDatabase())
  }
  return g.__llmService
}

export function getAlertService(): AlertService {
  if (!g.__alertService) {
    g.__alertService = new AlertService(getDatabase())
  }
  return g.__alertService
}
