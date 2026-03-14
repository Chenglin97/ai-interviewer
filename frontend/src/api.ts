const BASE = '/api'

export interface Question {
  text: string
  weight: number
}

export interface RoleConfig {
  style: string
  follow_up_depth: number
  red_flags: string[]
  green_flags: string[]
}

export interface Role {
  id: string
  title: string
  company_context: string | null
  questions: Question[]
  config: RoleConfig
  created_at: string
}

export interface Session {
  id: string
  role_id: string
  candidate_name: string | null
  status: string
  started_at: string | null
  ended_at: string | null
}

export async function createRole(data: {
  title: string
  company_context?: string
  questions: Question[]
  config?: Partial<RoleConfig>
}): Promise<Role> {
  const res = await fetch(`${BASE}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create role')
  return res.json()
}

export async function listRoles(): Promise<Role[]> {
  const res = await fetch(`${BASE}/roles`)
  if (!res.ok) throw new Error('Failed to list roles')
  return res.json()
}

export async function getRole(id: string): Promise<Role> {
  const res = await fetch(`${BASE}/roles/${id}`)
  if (!res.ok) throw new Error('Role not found')
  return res.json()
}

export async function createSession(roleId: string, candidateName?: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_id: roleId, candidate_name: candidateName }),
  })
  if (!res.ok) throw new Error('Failed to create session')
  return res.json()
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`)
  if (!res.ok) throw new Error('Session not found')
  return res.json()
}

export async function generateRole(extracted: Record<string, any>): Promise<{ role_id: string; title: string }> {
  const res = await fetch(`${BASE}/roles/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extracted }),
  })
  if (!res.ok) throw new Error('Failed to generate role')
  return res.json()
}

export async function getScorecard(sessionId: string) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/scorecard`)
  if (!res.ok) throw new Error('Scorecard not found')
  return res.json()
}

export interface RoleStats {
  total_candidates: number
  completed: number
  active: number
  average_score: number | null
}

export interface SessionSummary {
  id: string
  candidate_name: string | null
  status: string
  started_at: string | null
  ended_at: string | null
  overall_score: number | null
  scorecard_summary: string | null
}

export interface TranscriptMessage {
  speaker: 'agent' | 'candidate'
  text: string
  scores: { relevance?: number; depth?: number; authenticity?: number } | null
  timestamp: string
}

export async function getRoleStats(roleId: string): Promise<RoleStats> {
  const res = await fetch(`${BASE}/roles/${roleId}/stats`)
  if (!res.ok) throw new Error('Failed to get stats')
  return res.json()
}

export async function getRoleSessions(roleId: string): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE}/roles/${roleId}/sessions`)
  if (!res.ok) throw new Error('Failed to get sessions')
  return res.json()
}

export async function getTranscript(sessionId: string): Promise<TranscriptMessage[]> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/transcript`)
  if (!res.ok) throw new Error('Failed to get transcript')
  return res.json()
}
