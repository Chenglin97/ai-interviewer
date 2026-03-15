import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  getRole, createSession, uploadResume, getRoleStats, getRoleSessions,
  type Role, type RoleStats, type SessionSummary,
} from '../api'

function scoreClass(score: number, max: number = 10) {
  const pct = score / max
  if (pct >= 0.7) return 'score-high'
  if (pct >= 0.4) return 'score-mid'
  return 'score-low'
}

export default function RoleDashboard() {
  const { roleId } = useParams<{ roleId: string }>()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [stats, setStats] = useState<RoleStats | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [candidateName, setCandidateName] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!roleId) return
    getRole(roleId).then(setRole).catch(() => alert('Role not found'))
    getRoleStats(roleId).then(setStats).catch(() => {})
    getRoleSessions(roleId).then(setSessions).catch(() => {})
  }, [roleId])

  const startInterview = async () => {
    if (!roleId) return
    setLoading(true)
    try {
      const session = await createSession(roleId, candidateName || undefined)
      if (resumeFile) {
        await uploadResume(session.id, resumeFile)
      }
      navigate(`/interview/${session.id}`)
    } catch (e: any) {
      alert(e.message || 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  const copyLink = () => {
    const link = `${window.location.origin}/roles/${roleId}`
    navigator.clipboard.writeText(link)
    alert('Link copied!')
  }

  if (!role) return <div className="container">Loading...</div>

  return (
    <div className="container">
      <Link to="/" style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Back</Link>

      <h1 style={{ marginTop: '0.5rem' }}>{role.title}</h1>

      {/* Stats bar */}
      {stats && (
        <div className="flex gap-2" style={{ marginBottom: '1.5rem' }}>
          <div className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6366f1' }}>{stats.total_candidates}</div>
            <div style={{ color: '#888', fontSize: '0.85rem' }}>Total Interviews</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6ee7b7' }}>{stats.completed}</div>
            <div style={{ color: '#888', fontSize: '0.85rem' }}>Completed</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fcd34d' }}>{stats.active}</div>
            <div style={{ color: '#888', fontSize: '0.85rem' }}>In Progress</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: stats.average_score ? '#6366f1' : '#555' }}>
              {stats.average_score ?? '—'}
            </div>
            <div style={{ color: '#888', fontSize: '0.85rem' }}>Avg Score</div>
          </div>
        </div>
      )}

      {/* Role config summary */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Interview Config</h2>
          <div className="flex gap-1">
            <span className="tag">{role.config.style}</span>
            <span className="tag">{role.config.follow_up_depth} follow-ups</span>
          </div>
        </div>
        {role.company_context && (
          <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{role.company_context}</p>
        )}
        <div style={{ fontSize: '0.85rem' }}>
          {role.questions.map((q, i) => (
            <div key={i} style={{ padding: '0.25rem 0', display: 'flex', justifyContent: 'space-between' }}>
              <span>{q.text}</span>
              <span className="tag" style={{ fontSize: '0.7rem' }}>wt:{q.weight}</span>
            </div>
          ))}
        </div>
        {(role.config.green_flags.length > 0 || role.config.red_flags.length > 0) && (
          <div className="flex gap-1 mt-1" style={{ flexWrap: 'wrap' }}>
            {role.config.green_flags.map((f, i) => (
              <span key={`g${i}`} className="tag" style={{ borderColor: '#065f46', fontSize: '0.75rem' }}>+ {f}</span>
            ))}
            {role.config.red_flags.map((f, i) => (
              <span key={`r${i}`} className="tag" style={{ borderColor: '#7f1d1d', fontSize: '0.75rem' }}>- {f}</span>
            ))}
          </div>
        )}
      </div>

      {/* Start new interview */}
      <div className="card">
        <h2 style={{ fontSize: '1rem' }}>Start a Candidate Interview</h2>
        <input
          placeholder="Candidate name (optional)"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
        />
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>
            Upload resume (PDF, DOCX, or TXT) — optional
          </label>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
            style={{ fontSize: '0.85rem' }}
          />
          {resumeFile && (
            <span style={{ fontSize: '0.8rem', color: '#6ee7b7', marginLeft: '0.5rem' }}>
              {resumeFile.name}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={startInterview} disabled={loading}>
            {loading ? 'Starting...' : 'Start Interview'}
          </button>
          <button className="secondary" onClick={copyLink}>
            Copy Share Link
          </button>
        </div>
      </div>

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="mt-2">
          <h2>Interview History</h2>
          {sessions.map((s) => (
            <Link
              key={s.id}
              to={s.status === 'completed' ? `/review/${s.id}` : `/interview/${s.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card" style={{ cursor: 'pointer' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <strong>{s.candidate_name || 'Anonymous'}</strong>
                    <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      {s.status === 'completed' ? 'Completed' : s.status === 'active' ? 'In Progress' : 'Pending'}
                      {s.started_at && ` \u00b7 ${new Date(s.started_at).toLocaleDateString()}`}
                    </div>
                    {s.scorecard_summary && (
                      <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {s.scorecard_summary}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.overall_score != null && (
                      <span className={`score-badge ${scoreClass(s.overall_score)}`}>
                        {s.overall_score}
                      </span>
                    )}
                    <span style={{ color: '#6366f1' }}>&rarr;</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
