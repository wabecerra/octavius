import { describe, it, expect } from 'vitest'
import {
  getSpecialistTools,
  parseToolCalls,
  SPECIALIST_IDS,
} from './specialist-tools'

describe('specialist-tools', () => {
  it('returns tool definitions with valid JSON schema', () => {
    const tools = getSpecialistTools()
    expect(tools).toHaveLength(2) // spawn_specialist + discover_specialists

    const spawnTool = tools.find(t => t.function.name === 'spawn_specialist')
    expect(spawnTool).toBeDefined()
    expect(spawnTool!.function.parameters.required).toContain('specialist_id')
    expect(spawnTool!.function.parameters.required).toContain('instruction')
  })

  it('discover_specialists returns all available specialists', () => {
    const tools = getSpecialistTools()
    const discoverTool = tools.find(t => t.function.name === 'discover_specialists')
    expect(discoverTool).toBeDefined()
  })

  it('parseToolCalls extracts spawn requests from LLM response', () => {
    const llmResponse = {
      tool_calls: [{
        function: {
          name: 'spawn_specialist',
          arguments: JSON.stringify({
            specialist_id: 'specialist-research',
            instruction: 'Research top anxiety apps',
          }),
        },
      }],
    }

    const calls = parseToolCalls(llmResponse.tool_calls)
    expect(calls).toHaveLength(1)
    expect(calls[0].specialistId).toBe('specialist-research')
    expect(calls[0].instruction).toBe('Research top anxiety apps')
  })

  it('validates specialist_id against known IDs', () => {
    expect(SPECIALIST_IDS).toContain('specialist-research')
    expect(SPECIALIST_IDS).toContain('specialist-architect')
    expect(SPECIALIST_IDS).toContain('specialist-coder')
    expect(SPECIALIST_IDS).not.toContain('invalid-agent')
  })
})
