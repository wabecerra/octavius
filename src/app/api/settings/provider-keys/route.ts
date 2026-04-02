import { NextResponse } from 'next/server'
import {
  listProviderKeys,
  saveProviderKey,
  PROVIDER_DEFINITIONS,
} from '@/lib/provider-keys'

/** GET /api/settings/provider-keys — list all providers with masked status */
export async function GET() {
  const keys = listProviderKeys()

  // Mask actual key values for the response — only show whether they're set
  const masked = keys.map(k => ({
    providerId: k.providerId,
    displayName: k.displayName,
    enabled: k.enabled,
    hasKey: k.hasKey,
    updatedAt: k.updatedAt,
    // Show non-secret fields (like region, endpoint) unmasked
    config: Object.fromEntries(
      Object.entries(k.config).map(([field, val]) => {
        const def = PROVIDER_DEFINITIONS.find(d => d.providerId === k.providerId)
        const fieldDef = def?.fields.find(f => f.key === field)
        if (fieldDef?.type === 'apikey') {
          return [field, val ? `${val.slice(0, 4)}...${val.slice(-4)}` : '']
        }
        return [field, val]
      })
    ),
    fields: PROVIDER_DEFINITIONS.find(d => d.providerId === k.providerId)?.fields ?? [],
  }))

  return NextResponse.json({ providers: masked })
}

/** PUT /api/settings/provider-keys — save a provider's key + config */
export async function PUT(request: Request) {
  const body = await request.json()
  const { providerId, apiKey, config, enabled } = body as {
    providerId: string
    apiKey?: string
    config?: Record<string, string>
    enabled?: boolean
  }

  if (!providerId) {
    return NextResponse.json({ error: 'providerId is required' }, { status: 400 })
  }

  try {
    saveProviderKey(
      providerId,
      apiKey || '',
      config || {},
      enabled ?? true,
    )
    return NextResponse.json({ ok: true, providerId })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 400 },
    )
  }
}
