import type { MemoryLayer, MemoryType, QuadrantId } from './models'
import { MEMORY_LAYERS, MEMORY_TYPES, QUADRANT_IDS } from './models'

export class MemoryValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message)
    this.name = 'MemoryValidationError'
  }
}

/** Throws if value is outside [0.0, 1.0]. */
export function validateConfidence(value: number): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0.0 || value > 1.0) {
    throw new MemoryValidationError(
      `confidence must be a number between 0.0 and 1.0, got ${value}`,
      'confidence',
    )
  }
}

/** Throws if value is outside [0.0, 1.0]. */
export function validateImportance(value: number): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0.0 || value > 1.0) {
    throw new MemoryValidationError(
      `importance must be a number between 0.0 and 1.0, got ${value}`,
      'importance',
    )
  }
}

/** Throws if value is not a valid MemoryType. */
export function validateMemoryType(value: string): asserts value is MemoryType {
  if (!(MEMORY_TYPES as readonly string[]).includes(value)) {
    throw new MemoryValidationError(
      `type must be one of ${MEMORY_TYPES.join(', ')}, got '${value}'`,
      'type',
    )
  }
}

/** Throws if value is not a valid MemoryLayer. */
export function validateMemoryLayer(value: string): asserts value is MemoryLayer {
  if (!(MEMORY_LAYERS as readonly string[]).includes(value)) {
    throw new MemoryValidationError(
      `layer must be one of ${MEMORY_LAYERS.join(', ')}, got '${value}'`,
      'layer',
    )
  }
}

/** Throws if value is not a valid QuadrantId. */
export function validateQuadrantId(value: string): asserts value is QuadrantId {
  if (!(QUADRANT_IDS as readonly string[]).includes(value)) {
    throw new MemoryValidationError(
      `quadrant must be one of ${QUADRANT_IDS.join(', ')}, got '${value}'`,
      'quadrant',
    )
  }
}
