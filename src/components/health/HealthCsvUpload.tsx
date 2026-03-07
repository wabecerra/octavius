'use client'

import { useState, useRef, useCallback } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

interface ImportResult {
  imported: number
  skipped: Array<{ row: number; reason: string }>
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'success'; result: ImportResult }
  | { status: 'error'; message: string; skipped?: Array<{ row: number; reason: string }> }

export function HealthCsvUpload({ onImportSuccess }: { onImportSuccess?: () => void }) {
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setState({ status: 'error', message: 'Please upload a .csv file.' })
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setState({ status: 'error', message: 'File exceeds the 10 MB size limit.' })
      return
    }

    setState({ status: 'uploading', progress: 0 })
    const formData = new FormData()
    formData.append('file', file)

    try {
      const xhr = new XMLHttpRequest()
      const result = await new Promise<ImportResult>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setState({ status: 'uploading', progress: Math.round((e.loaded / e.total) * 100) })
          }
        })
        xhr.addEventListener('load', () => {
          try {
            const body = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) { resolve(body) } else { reject(body) }
          } catch { reject({ error: 'Invalid response' }) }
        })
        xhr.addEventListener('error', () => reject({ error: 'Network error' }))
        xhr.open('POST', '/api/health/import')
        xhr.send(formData)
      })
      setState({ status: 'success', result })
      onImportSuccess?.()
    } catch (err: unknown) {
      const e = err as { error?: string; skipped?: Array<{ row: number; reason: string }> }
      setState({ status: 'error', message: e.error ?? 'Upload failed', skipped: e.skipped })
    }
  }, [onImportSuccess])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }, [uploadFile])

  return (
    <div className="space-y-3">
      {/* Drop zone — full width */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        className={`w-full border border-dashed rounded-xl px-6 py-5 text-center cursor-pointer transition-colors duration-150 ${
          dragOver
            ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
            : 'border-[var(--border-primary)] hover:border-[var(--text-tertiary)] bg-[var(--bg-secondary)]'
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
        <p className="text-sm text-[var(--text-secondary)]">
          Drag &amp; drop a RingConn .csv export here, or click to browse
        </p>
        <p className="text-[10px] text-[var(--text-disabled)] mt-1">CSV · Max 10 MB</p>
      </div>

      {/* Progress bar */}
      {state.status === 'uploading' && (
        <div className="space-y-1">
          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5">
            <div
              className="bg-[var(--quadrant-health)] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">Importing… {state.progress}%</p>
        </div>
      )}

      {/* Success */}
      {state.status === 'success' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)]">
          <span className="text-[var(--color-success)] text-sm">✓</span>
          <p className="text-sm text-[var(--color-success)]">
            Imported {state.result.imported} reading{state.result.imported !== 1 ? 's' : ''}
          </p>
          {state.result.skipped.length > 0 && (
            <span className="text-xs text-[var(--text-tertiary)]">
              · {state.result.skipped.length} skipped
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {state.status === 'error' && (
        <div className="px-3 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-error)_8%,transparent)]">
          <p className="text-sm text-[var(--color-error)]">{state.message}</p>
          {state.skipped && state.skipped.length > 0 && (
            <ul className="mt-1.5 text-xs text-[var(--text-tertiary)] space-y-0.5 max-h-24 overflow-y-auto">
              {state.skipped.map((s) => (
                <li key={s.row}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
