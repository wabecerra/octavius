export interface ParsedCommand {
  name: string
  args: string[]
}

export interface CommandResult {
  response: string
  source: 'command'
}

const KNOWN_COMMANDS = new Set([
  'reset', 'compact', 'recall', 'status', 'agents',
  'approve', 'reject', 'mode', 'stop', 'cost', 'history',
])

export function isSlashCommand(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return false
  const name = trimmed.slice(1).split(/\s+/)[0]
  return KNOWN_COMMANDS.has(name)
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const parts = trimmed.slice(1).split(/\s+/)
  const name = parts[0]
  if (!KNOWN_COMMANDS.has(name)) return null
  return { name, args: parts.slice(1) }
}

// executeCommand will be implemented in Task 5 when GatewayBridge is available
// TODO: implement executeCommand(cmd: ParsedCommand, bridge: GatewayBridge): Promise<CommandResult>
