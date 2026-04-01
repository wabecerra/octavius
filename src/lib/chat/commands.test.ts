import { describe, it, expect } from 'vitest'
import { isSlashCommand, parseCommand, type ParsedCommand } from './commands'

describe('isSlashCommand', () => {
  it('returns true for known commands', () => {
    expect(isSlashCommand('/reset')).toBe(true)
    expect(isSlashCommand('/stop')).toBe(true)
    expect(isSlashCommand('/compact')).toBe(true)
    expect(isSlashCommand('/recall')).toBe(true)
    expect(isSlashCommand('/status')).toBe(true)
    expect(isSlashCommand('/agents')).toBe(true)
    expect(isSlashCommand('/approve')).toBe(true)
    expect(isSlashCommand('/reject')).toBe(true)
    expect(isSlashCommand('/mode')).toBe(true)
    expect(isSlashCommand('/cost')).toBe(true)
    expect(isSlashCommand('/history')).toBe(true)
  })

  it('returns true for known commands with arguments', () => {
    expect(isSlashCommand('/stop agent:main')).toBe(true)
    expect(isSlashCommand('/mode auto')).toBe(true)
    expect(isSlashCommand('/recall last week tasks')).toBe(true)
    expect(isSlashCommand('/cost today')).toBe(true)
    expect(isSlashCommand('/approve subagent:gen-industry')).toBe(true)
  })

  it('returns true for commands with extra whitespace', () => {
    expect(isSlashCommand('  /reset  ')).toBe(true)
    expect(isSlashCommand('  /stop   agent:main  ')).toBe(true)
  })

  it('returns false for non-slash input', () => {
    expect(isSlashCommand('hello')).toBe(false)
    expect(isSlashCommand('just a normal message')).toBe(false)
  })

  it('returns false for malformed slash commands', () => {
    expect(isSlashCommand('/ not a command')).toBe(false)
    expect(isSlashCommand('/unknown')).toBe(false)
    expect(isSlashCommand('/RESET')).toBe(false)
  })

  it('returns false for slash at end of message', () => {
    expect(isSlashCommand('command /')).toBe(false)
  })
})

describe('parseCommand', () => {
  it('parses simple commands without arguments', () => {
    const result = parseCommand('/reset')
    expect(result).toEqual({ name: 'reset', args: [] })
  })

  it('parses commands with single argument', () => {
    const result = parseCommand('/stop agent:main')
    expect(result).toEqual({ name: 'stop', args: ['agent:main'] })
  })

  it('parses commands with multiple arguments', () => {
    const result = parseCommand('/recall last week tasks')
    expect(result).toEqual({ name: 'recall', args: ['last', 'week', 'tasks'] })
  })

  it('parses commands with colon-separated arguments', () => {
    const result = parseCommand('/approve subagent:gen-industry')
    expect(result).toEqual({ name: 'approve', args: ['subagent:gen-industry'] })
  })

  it('preserves argument order and formatting', () => {
    const result = parseCommand('/mode auto fast')
    expect(result).toEqual({ name: 'mode', args: ['auto', 'fast'] })
  })

  it('handles leading/trailing whitespace', () => {
    const result = parseCommand('  /cost   today  ')
    expect(result).toEqual({ name: 'cost', args: ['today'] })
  })

  it('returns null for non-slash input', () => {
    expect(parseCommand('hello')).toBeNull()
    expect(parseCommand('just a message')).toBeNull()
  })

  it('returns null for unknown commands', () => {
    expect(parseCommand('/unknown')).toBeNull()
    expect(parseCommand('/foobar arg1 arg2')).toBeNull()
  })

  it('returns null for malformed slash commands', () => {
    expect(parseCommand('/ not a command')).toBeNull()
    expect(parseCommand('/RESET')).toBeNull()
  })

  it('returns null for slash at end of message', () => {
    expect(parseCommand('command /')).toBeNull()
  })

  it('handles all known command types', () => {
    const commands = [
      '/reset',
      '/compact',
      '/recall',
      '/status',
      '/agents',
      '/approve',
      '/reject',
      '/mode',
      '/stop',
      '/cost',
      '/history',
    ]

    for (const cmd of commands) {
      const result = parseCommand(cmd)
      expect(result).not.toBeNull()
      expect(result?.name).toBeDefined()
      expect(Array.isArray(result?.args)).toBe(true)
    }
  })
})
