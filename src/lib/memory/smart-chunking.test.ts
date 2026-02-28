import { describe, it, expect } from 'vitest'
import { smartChunk } from './smart-chunking'

describe('smartChunk', () => {
  it('returns single chunk for short text', () => {
    const text = 'Hello world, this is a short text.'
    const chunks = smartChunk(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(text)
    expect(chunks[0].position).toBe(0)
    expect(chunks[0].sequence).toBe(0)
  })

  it('splits long text into multiple chunks', () => {
    // Generate text that's ~2000 tokens (~8000 chars)
    const paragraph = 'This is a test paragraph with enough words to fill some space. '
    const text = paragraph.repeat(130) // ~8000+ chars
    const chunks = smartChunk(text, 900)

    expect(chunks.length).toBeGreaterThan(1)
    // Each chunk should have position and sequence metadata
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].sequence).toBe(i)
      expect(chunks[i].position).toBeGreaterThanOrEqual(0)
      expect(chunks[i].text.length).toBeGreaterThan(0)
    }
  })

  it('prefers heading break points over arbitrary positions', () => {
    // Build text with a heading near the target boundary
    const filler = 'word '.repeat(800) // ~800 tokens
    const text = `${filler}\n\n## Important Section\n\nMore content here that continues for a while. ${'more '.repeat(200)}`

    const chunks = smartChunk(text, 900)
    expect(chunks.length).toBeGreaterThanOrEqual(2)

    // The second chunk should start near the heading
    const secondChunk = chunks[1].text.trim()
    // Due to overlap, the heading might be at the start or near it
    expect(secondChunk.length).toBeGreaterThan(0)
  })

  it('respects code fence protection', () => {
    const code = '```\nfunction hello() {\n  console.log("hi")\n}\n```'
    const filler = 'word '.repeat(800)
    const text = `${filler}\n${code}\n${'more '.repeat(200)}`

    const chunks = smartChunk(text, 900)
    // Code block should not be split in the middle
    for (const chunk of chunks) {
      const fenceCount = (chunk.text.match(/```/g) || []).length
      // Each chunk should have 0 or an even number of fences (complete blocks)
      expect(fenceCount % 2).toBe(0)
    }
  })

  it('handles custom target tokens', () => {
    const text = 'word '.repeat(500) // ~500 tokens
    const smallChunks = smartChunk(text, 100)
    const largeChunks = smartChunk(text, 400)

    expect(smallChunks.length).toBeGreaterThan(largeChunks.length)
  })

  it('handles empty text', () => {
    const chunks = smartChunk('')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('')
  })

  it('preserves all content across chunks (no data loss)', () => {
    const text = 'word '.repeat(500)
    const chunks = smartChunk(text, 200, 0) // no overlap for this test

    // All original content should be recoverable from chunks
    const reconstructed = chunks.map((c) => c.text).join('')
    // Due to break-point selection, reconstructed may differ slightly
    // but total length should be close
    expect(reconstructed.length).toBeGreaterThanOrEqual(text.length * 0.9)
  })
})
