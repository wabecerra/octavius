// src/app/api/llm-cost/service.ts
// Shared service instance for LLM cost API routes

import { getDatabase } from '@/lib/memory/db'
import { LLMLoggingService } from '@/lib/llm-cost'

let _service: LLMLoggingService | null = null

export function getService(): LLMLoggingService {
  if (!_service) {
    const db = getDatabase()
    _service = new LLMLoggingService(db)
  }
  return _service
}
