/**
 * Cross-Quadrant Intelligence
 * 
 * This module provides holistic awareness across Octavius's 4 quadrants:
 * - Lifeforce (health) — physical and mental wellness
 * - Industry (career) — productivity and work
 * - Fellowship (relationships) — social connections
 * - Essence (soul) — reflection and meaning
 * 
 * Components:
 * - SignalBus: Real-time cross-quadrant event system
 * - Correlations: Pattern analysis between quadrants
 * - ContextDetector: Infers user's current life mode
 */

// Signal Bus - real-time cross-quadrant communication
export {
  SignalBus,
  getSignalBus,
  analyzeAndEmitSignals,
  generateRecommendations,
  type Signal,
  type SignalType,
  type SignalSeverity,
  type SignalHandler,
  type CrossQuadrantRecommendation,
} from './signals'

// Correlation Analysis - pattern discovery
export {
  extractDataPoints,
  correlate,
  computeCrossQuadrantCorrelations,
  getTopCorrelations,
  computeQuadrantHealth,
  type DataPoint,
  type CorrelationResult,
  type QuadrantHealthScore,
} from './correlations'

// Context Detector - life mode inference
export {
  detectContext,
  describeContext,
  getModeConstraints,
  suggestOptimalTimes,
  type LifeMode,
  type ContextSnapshot,
  type ContextFactor,
  type ModeConstraints,
  type OptimalTimeSlot,
} from './context-detector'
