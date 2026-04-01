import { NextResponse } from 'next/server'
import { getGatewayBridge } from '@/lib/gateway/bridge'
import { AgentEventType } from '@/lib/gateway/bridge-events'

/**
 * POST /api/chat/agent-reply — Agent posts a message/question to ChatPanel.
 * Body: { message, taskId?, sessionKey?, waitForReply?, timeout? }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { message, taskId, sessionKey } = body

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const bridge = getGatewayBridge()

  // Emit as an approval-needed event so ChatPanel shows the prompt
  bridge.emit('agent-event', {
    type: AgentEventType.APPROVAL_NEEDED,
    agentId: sessionKey ? sessionKey.replace(/^subagent:/, '') : 'unknown',
    taskId,
    text: message,
    sessionKey,
    timestamp: new Date().toISOString(),
  })

  return NextResponse.json({
    status: 'posted',
    message: 'Message sent to chat.',
  })
}
