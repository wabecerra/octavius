import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const OPENCLAW_PATH = '/local/workplace/wabo/ocbot/openclaw'

/**
 * POST /api/chat — Send a message through the OpenClaw agent via CLI.
 * Uses the openclaw agent command which handles all the complexity.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { message } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  try {
    // Use openclaw CLI agent command
    const command = `cd "${OPENCLAW_PATH}" && node openclaw.mjs agent --session-id main --message ${JSON.stringify(message)} --json --timeout 30`
    console.log('[Chat API] Running OpenClaw agent...')
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 40000, // 40s total timeout
      encoding: 'utf8',
    })
    
    if (stderr) {
      console.log('[Chat API] Stderr:', stderr.slice(0, 200))
    }
    
    // Parse the JSON response from the CLI
    const result = JSON.parse(stdout.trim())
    
    if (result.status !== 'ok') {
      throw new Error(`Agent failed: ${result.summary || 'unknown error'}`)
    }
    
    // Extract the response text from the payloads
    const responseText = result.result?.payloads?.[0]?.text || '(no response)'
    
    console.log('[Chat API] Agent response:', responseText.slice(0, 200))
    
    return NextResponse.json({
      response: responseText,
      source: 'gateway',
      meta: {
        model: result.result?.meta?.agentMeta?.model || 'unknown',
        provider: result.result?.meta?.agentMeta?.provider || 'unknown',
        durationMs: result.result?.meta?.durationMs || 0,
        usage: result.result?.meta?.agentMeta?.usage || null,
      },
    })
    
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string }
    console.error('[Chat API] Error:', error.message)
    
    // Try to parse partial JSON response if available
    if (error.stdout) {
      try {
        const partialResult = JSON.parse(error.stdout)
        if (partialResult.result?.payloads?.[0]?.text) {
          return NextResponse.json({
            response: partialResult.result.payloads[0].text,
            source: 'gateway-partial',
            warning: 'Request completed but timed out waiting for full response',
          })
        }
      } catch {
        // Ignore parse errors
      }
    }
    
    return NextResponse.json({
      response: `Sorry, I couldn't process your message right now. Error: ${error.message}`,
      source: 'error',
    }, { status: 500 })
  }
}