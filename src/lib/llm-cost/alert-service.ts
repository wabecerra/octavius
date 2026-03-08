// src/lib/llm-cost/alert-service.ts
// Alert rules engine — evaluate rules against live metrics and fire alerts

import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import type { AlertRule, AlertEvent, AlertSeverity } from './types'

export class AlertService {
  constructor(private db: Database.Database) {}

  /** Create an alert rule. */
  createRule(input: {
    name: string
    type: AlertRule['type']
    condition: AlertRule['condition']
    severity?: AlertSeverity
    enabled?: boolean
  }): AlertRule {
    const id = nanoid()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO llm_alert_rules (id, name, enabled, type, condition_json, severity, trigger_count, created_at)
         VALUES (?,?,?,?,?,?,0,?)`,
      )
      .run(id, input.name, input.enabled !== false ? 1 : 0, input.type,
        JSON.stringify(input.condition), input.severity ?? 'warning', now)

    return this.getRule(id)!
  }

  /** Get a rule by ID. */
  getRule(id: string): AlertRule | null {
    const row = this.db
      .prepare('SELECT * FROM llm_alert_rules WHERE id = ?')
      .get(id) as RuleRow | undefined
    return row ? ruleRowToRule(row) : null
  }

  /** List all rules. */
  listRules(includeDisabled = false): AlertRule[] {
    const sql = includeDisabled
      ? 'SELECT * FROM llm_alert_rules ORDER BY created_at DESC'
      : 'SELECT * FROM llm_alert_rules WHERE enabled = 1 ORDER BY created_at DESC'
    const rows = this.db.prepare(sql).all() as RuleRow[]
    return rows.map(ruleRowToRule)
  }

  /** Update a rule. */
  updateRule(id: string, updates: Partial<{
    name: string
    enabled: boolean
    condition: AlertRule['condition']
    severity: AlertSeverity
  }>): AlertRule | null {
    const existing = this.getRule(id)
    if (!existing) return null

    if (updates.name != null) {
      this.db.prepare('UPDATE llm_alert_rules SET name = ? WHERE id = ?').run(updates.name, id)
    }
    if (updates.enabled != null) {
      this.db.prepare('UPDATE llm_alert_rules SET enabled = ? WHERE id = ?').run(updates.enabled ? 1 : 0, id)
    }
    if (updates.condition != null) {
      this.db.prepare('UPDATE llm_alert_rules SET condition_json = ? WHERE id = ?').run(JSON.stringify(updates.condition), id)
    }
    if (updates.severity != null) {
      this.db.prepare('UPDATE llm_alert_rules SET severity = ? WHERE id = ?').run(updates.severity, id)
    }

    return this.getRule(id)
  }

  /** Delete a rule. */
  deleteRule(id: string): boolean {
    return this.db.prepare('DELETE FROM llm_alert_rules WHERE id = ?').run(id).changes > 0
  }

  /** Evaluate all enabled rules against current metrics. Returns newly fired events. */
  evaluate(): AlertEvent[] {
    const rules = this.listRules(false)
    const events: AlertEvent[] = []
    const now = new Date()

    for (const rule of rules) {
      const metricValue = this.getMetricValue(rule)
      if (metricValue === null) continue

      const triggered = this.checkCondition(metricValue, rule.condition)
      if (!triggered) continue

      // Cooldown: don't re-fire within 5 minutes
      if (rule.last_triggered_at) {
        const lastFired = new Date(rule.last_triggered_at)
        if (now.getTime() - lastFired.getTime() < 5 * 60 * 1000) continue
      }

      const event: AlertEvent = {
        id: nanoid(),
        rule_id: rule.id,
        rule_name: rule.name,
        triggered_at: now.toISOString(),
        severity: rule.severity,
        metric_value: metricValue,
        threshold_value: rule.condition.threshold,
      }

      // Store the event
      this.db
        .prepare(
          `INSERT INTO llm_alert_events (id, rule_id, rule_name, triggered_at, severity, metric_value, threshold_value)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(event.id, event.rule_id, event.rule_name, event.triggered_at,
          event.severity, event.metric_value, event.threshold_value)

      // Update rule trigger state
      this.db
        .prepare('UPDATE llm_alert_rules SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?')
        .run(now.toISOString(), rule.id)

      events.push(event)
    }

    return events
  }

  /** Get recent alert events. */
  getEvents(opts?: { limit?: number; rule_id?: string; severity?: string }): AlertEvent[] {
    let sql = 'SELECT * FROM llm_alert_events WHERE 1=1'
    const params: unknown[] = []

    if (opts?.rule_id) { sql += ' AND rule_id = ?'; params.push(opts.rule_id) }
    if (opts?.severity) { sql += ' AND severity = ?'; params.push(opts.severity) }

    sql += ' ORDER BY triggered_at DESC LIMIT ?'
    params.push(opts?.limit ?? 50)

    const rows = this.db.prepare(sql).all(...params) as EventRow[]
    return rows.map(eventRowToEvent)
  }

  /** Resolve an alert event. */
  resolveEvent(eventId: string): boolean {
    const result = this.db
      .prepare('UPDATE llm_alert_events SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL')
      .run(new Date().toISOString(), eventId)
    return result.changes > 0
  }

  // ── Private helpers ──

  private getMetricValue(rule: AlertRule): number | null {
    const cond = rule.condition
    const windowMinutes = cond.window_minutes ?? 60
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

    switch (cond.metric) {
      case 'cost_total_usd': {
        const row = this.db
          .prepare('SELECT COALESCE(SUM(cost_total_usd), 0) as val FROM llm_logs WHERE timestamp >= ?')
          .get(since) as { val: number }
        return row.val
      }
      case 'error_rate': {
        const row = this.db
          .prepare(
            `SELECT
               CASE WHEN COUNT(*) = 0 THEN 0
               ELSE CAST(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100
               END as val
             FROM llm_logs WHERE timestamp >= ?`,
          )
          .get(since) as { val: number }
        return row.val
      }
      case 'avg_latency_ms': {
        const row = this.db
          .prepare('SELECT COALESCE(AVG(latency_total_ms), 0) as val FROM llm_logs WHERE timestamp >= ?')
          .get(since) as { val: number }
        return row.val
      }
      case 'request_count': {
        const row = this.db
          .prepare('SELECT COUNT(*) as val FROM llm_logs WHERE timestamp >= ?')
          .get(since) as { val: number }
        return row.val
      }
      case 'tokens_total': {
        const row = this.db
          .prepare('SELECT COALESCE(SUM(tokens_total), 0) as val FROM llm_logs WHERE timestamp >= ?')
          .get(since) as { val: number }
        return row.val
      }
      default:
        return null
    }
  }

  private checkCondition(value: number, condition: AlertRule['condition']): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold
      case 'gte': return value >= condition.threshold
      case 'lt': return value < condition.threshold
      case 'lte': return value <= condition.threshold
      default: return false
    }
  }
}

// ── Row types ──

interface RuleRow {
  id: string
  name: string
  enabled: number
  type: string
  condition_json: string
  severity: string
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
}

function ruleRowToRule(row: RuleRow): AlertRule {
  return {
    id: row.id,
    name: row.name,
    enabled: !!row.enabled,
    type: row.type as AlertRule['type'],
    condition: JSON.parse(row.condition_json),
    severity: row.severity as AlertSeverity,
    last_triggered_at: row.last_triggered_at ?? undefined,
    trigger_count: row.trigger_count,
    created_at: row.created_at,
  }
}

interface EventRow {
  id: string
  rule_id: string
  rule_name: string
  triggered_at: string
  resolved_at: string | null
  severity: string
  metric_value: number
  threshold_value: number
}

function eventRowToEvent(row: EventRow): AlertEvent {
  return {
    id: row.id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    triggered_at: row.triggered_at,
    resolved_at: row.resolved_at ?? undefined,
    severity: row.severity as AlertSeverity,
    metric_value: row.metric_value,
    threshold_value: row.threshold_value,
  }
}
