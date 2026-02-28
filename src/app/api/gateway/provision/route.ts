import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { GatewayClient } from '@/lib/gateway/client'
import { AgentProvisioner } from '@/lib/gateway/provisioner'

/**
 * POST /api/gateway/provision — Trigger workspace provisioning.
 * Body: { basePath?: string }
 * Returns: ProvisionResult as JSON
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { basePath?: string }

    const db = getDatabase()
    const client = new GatewayClient()
    const provisioner = new AgentProvisioner(client, db)

    const result = await provisioner.provision(body.basePath)

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
