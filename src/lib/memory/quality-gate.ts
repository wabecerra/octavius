import type { CreateMemoryItemInput } from './models'

export interface QualityGateResult {
  pass: boolean
  confidence: number
  importance: number
  reason?: string
}

export class QualityGate {
  constructor(public readonly minConfidence: number = 0.3) {}

  evaluate(candidate: CreateMemoryItemInput): QualityGateResult {
    // Bypass: system_event with bypass flag always passes
    if (candidate.bypass_quality_gate && candidate.provenance.source_type === 'system_event') {
      return { pass: true, confidence: 1.0, importance: 0.5 }
    }

    const confidence = this.computeConfidence(candidate)
    const importance = this.computeImportance(candidate)

    if (confidence < this.minConfidence) {
      return {
        pass: false,
        confidence,
        importance,
        reason: `Confidence ${confidence.toFixed(3)} is below minimum threshold ${this.minConfidence}`,
      }
    }

    return { pass: true, confidence, importance }
  }

  private computeConfidence(candidate: CreateMemoryItemInput): number {
    let score = 0.5

    // Text length bonus
    const len = candidate.text.length
    if (len > 500) {
      score += 0.3
    } else if (len > 100) {
      score += 0.2
    } else if (len > 20) {
      score += 0.1
    }

    // Source reliability bonus
    const sourceType = candidate.provenance.source_type
    if (sourceType === 'user_input') {
      score += 0.1
    } else if (sourceType === 'agent_output') {
      score += 0.05
    }

    // Field completeness bonus
    if (candidate.tags && candidate.tags.length > 0) {
      score += 0.1
    }

    return clamp(score, 0, 1)
  }

  private computeImportance(candidate: CreateMemoryItemInput): number {
    let score = 0.5

    // Layer bonus
    if (candidate.layer === 'life_directory') {
      score += 0.2
    } else if (candidate.layer === 'tacit_knowledge') {
      score += 0.1
    }
    // daily_notes: +0.0

    // Type bonus
    if (candidate.type === 'semantic' || candidate.type === 'procedural') {
      score += 0.1
    } else if (candidate.type === 'entity_profile') {
      score += 0.05
    }
    // episodic: +0.0

    return clamp(score, 0, 1)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
