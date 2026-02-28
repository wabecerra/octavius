/**
 * Smart Chunking — splits long text into semantically coherent chunks
 * at natural markdown break points. Inspired by QMD's break-point scoring.
 *
 * Instead of cutting at hard token boundaries, scores potential break points
 * and picks the highest-scoring one near the target chunk size.
 */

export interface Chunk {
  text: string
  /** Character offset in the original text */
  position: number
  /** Sequence index (0, 1, 2...) */
  sequence: number
}

/** Break point scores by markdown pattern (from QMD). */
const BREAK_SCORES: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /^# /,       score: 100 },  // H1
  { pattern: /^## /,      score: 90 },   // H2
  { pattern: /^### /,     score: 80 },   // H3
  { pattern: /^#### /,    score: 70 },   // H4
  { pattern: /^##### /,   score: 60 },   // H5
  { pattern: /^###### /,  score: 50 },   // H6
  { pattern: /^```/,      score: 80 },   // Code fence
  { pattern: /^---$/,     score: 60 },   // Horizontal rule
  { pattern: /^\*\*\*$/,  score: 60 },   // Horizontal rule alt
  { pattern: /^$/,        score: 20 },   // Blank line
  { pattern: /^[-*+] /,   score: 5 },    // Unordered list item
  { pattern: /^\d+\. /,   score: 5 },    // Ordered list item
]

interface BreakPoint {
  /** Character position in the text */
  position: number
  /** Base score from pattern matching */
  baseScore: number
  /** Line index */
  lineIndex: number
}

/**
 * Find all break points in the text with their scores.
 */
function findBreakPoints(text: string): BreakPoint[] {
  const lines = text.split('\n')
  const breakPoints: BreakPoint[] = []
  let charPos = 0
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track code fence state — ignore break points inside code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      breakPoints.push({ position: charPos, baseScore: 80, lineIndex: i })
      charPos += line.length + 1
      continue
    }

    if (inCodeBlock) {
      charPos += line.length + 1
      continue
    }

    // Score this line as a potential break point
    for (const { pattern, score } of BREAK_SCORES) {
      if (pattern.test(line)) {
        breakPoints.push({ position: charPos, baseScore: score, lineIndex: i })
        break
      }
    }

    // Every line is at least a minimal break point
    if (!breakPoints.some((bp) => bp.position === charPos)) {
      breakPoints.push({ position: charPos, baseScore: 1, lineIndex: i })
    }

    charPos += line.length + 1
  }

  return breakPoints
}

/**
 * Rough token count estimate: ~4 chars per token for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Split text into chunks at natural markdown break points.
 *
 * @param text - The full text to chunk
 * @param targetTokens - Target tokens per chunk (default 900, matching QMD)
 * @param overlapPct - Overlap percentage (default 0.15 = 15%)
 * @returns Array of chunks with position and sequence metadata
 */
export function smartChunk(
  text: string,
  targetTokens = 900,
  overlapPct = 0.15,
): Chunk[] {
  const totalTokens = estimateTokens(text)

  // Don't chunk short texts
  if (totalTokens <= targetTokens * 1.2) {
    return [{ text, position: 0, sequence: 0 }]
  }

  const targetChars = targetTokens * 4
  const windowChars = Math.floor(targetChars * 0.22) // search window ~200 tokens
  const overlapChars = Math.floor(targetChars * overlapPct)
  const breakPoints = findBreakPoints(text)

  const chunks: Chunk[] = []
  let startPos = 0
  let seq = 0

  while (startPos < text.length) {
    const idealEnd = startPos + targetChars

    // If remaining text fits in one chunk, take it all
    if (idealEnd >= text.length) {
      chunks.push({ text: text.slice(startPos), position: startPos, sequence: seq })
      break
    }

    // Find the best break point in the window before the ideal end
    const windowStart = Math.max(startPos + 1, idealEnd - windowChars)
    const windowEnd = idealEnd

    let bestBreak: BreakPoint | null = null
    let bestFinalScore = -1

    for (const bp of breakPoints) {
      if (bp.position <= windowStart || bp.position > windowEnd) continue

      // Squared distance decay: closer to target = higher score
      const distance = windowEnd - bp.position
      const normalizedDist = distance / windowChars
      const finalScore = bp.baseScore * (1 - normalizedDist * normalizedDist * 0.7)

      if (finalScore > bestFinalScore) {
        bestFinalScore = finalScore
        bestBreak = bp
      }
    }

    const cutPos = bestBreak ? bestBreak.position : idealEnd
    chunks.push({ text: text.slice(startPos, cutPos), position: startPos, sequence: seq })

    // Advance with overlap
    startPos = cutPos - overlapChars
    if (startPos <= chunks[chunks.length - 1].position) {
      startPos = cutPos // prevent infinite loop
    }
    seq++
  }

  return chunks
}
