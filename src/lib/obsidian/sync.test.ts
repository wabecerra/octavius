import { describe, it, expect } from 'vitest'
import { parseFrontmatter, toMarkdown, extractWikilinks } from './sync'

describe('parseFrontmatter', () => {
  it('parses standard frontmatter with all fields', () => {
    const md = `---
memory_id: abc123
type: episodic
layer: daily_notes
confidence: 0.8
importance: 0.6
tags: [health, lifeforce]
source: octavius
created_at: 2026-03-20T00:00:00.000Z
---

This is the body text.`

    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.memory_id).toBe('abc123')
    expect(frontmatter.type).toBe('episodic')
    expect(frontmatter.layer).toBe('daily_notes')
    expect(frontmatter.confidence).toBe(0.8)
    expect(frontmatter.importance).toBe(0.6)
    expect(frontmatter.tags).toEqual(['health', 'lifeforce'])
    expect(frontmatter.source).toBe('octavius')
    expect(body.trim()).toBe('This is the body text.')
  })

  it('returns empty frontmatter for notes without frontmatter', () => {
    const md = 'Just a plain note with no frontmatter.'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter).toEqual({})
    expect(body).toBe(md)
  })

  it('handles empty body after frontmatter', () => {
    const md = `---
type: semantic
---
`
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.type).toBe('semantic')
    expect(body.trim()).toBe('')
  })

  it('parses numeric values correctly', () => {
    const md = `---
confidence: 0.95
importance: 1
---
text`
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.confidence).toBe(0.95)
    expect(frontmatter.importance).toBe(1)
  })

  it('handles colons in values (e.g. ISO timestamps)', () => {
    const md = `---
created_at: 2026-03-20T12:30:00.000Z
---
body`
    const { frontmatter } = parseFrontmatter(md)
    // The simple parser splits on first colon, so the value includes the rest
    expect(frontmatter.created_at).toBe('2026-03-20T12:30:00.000Z')
  })
})

describe('toMarkdown', () => {
  it('serializes frontmatter and body', () => {
    const md = toMarkdown(
      {
        memory_id: 'test-id',
        type: 'episodic',
        layer: 'daily_notes',
        confidence: 0.7,
        importance: 0.5,
        tags: ['quadrant:industry', 'project'],
        created_at: '2026-03-20T00:00:00.000Z',
      },
      'Hello world',
    )

    expect(md).toContain('memory_id: test-id')
    expect(md).toContain('type: episodic')
    expect(md).toContain('source: octavius')
    expect(md).toContain('tags: [quadrant:industry, project]')
    expect(md).toContain('Hello world')
    expect(md.startsWith('---\n')).toBe(true)
  })

  it('omits undefined fields', () => {
    const md = toMarkdown({ type: 'semantic' }, 'body')
    expect(md).not.toContain('memory_id')
    expect(md).not.toContain('confidence')
    expect(md).toContain('type: semantic')
    expect(md).toContain('source: octavius')
  })
})

describe('extractWikilinks', () => {
  it('extracts simple wikilinks', () => {
    const md = 'See [[Daily Notes]] and [[Projects]] for more.'
    expect(extractWikilinks(md)).toEqual(['Daily Notes', 'Projects'])
  })

  it('extracts wikilinks with display text (pipe syntax)', () => {
    const md = 'Check [[My Note|this note]] for details.'
    expect(extractWikilinks(md)).toEqual(['My Note'])
  })

  it('deduplicates links', () => {
    const md = '[[A]] links to [[B]] and [[A]] again.'
    expect(extractWikilinks(md)).toEqual(['A', 'B'])
  })

  it('returns empty array for no links', () => {
    expect(extractWikilinks('No links here.')).toEqual([])
  })

  it('handles links in frontmatter area', () => {
    const md = `---
tags: [test]
---
See [[Note A]] and [[Note B]].`
    // extractWikilinks operates on full markdown, which is fine
    expect(extractWikilinks(md)).toEqual(['Note A', 'Note B'])
  })

  it('handles nested brackets gracefully', () => {
    const md = 'Some [[valid link]] and some [not a link] text.'
    expect(extractWikilinks(md)).toEqual(['valid link'])
  })
})
