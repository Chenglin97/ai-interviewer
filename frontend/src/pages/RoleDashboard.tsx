import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getRole, createSession, type Role } from '../api'

export default function RoleDashboard() {
  const { roleId } = useParams<{ roleId: string }>()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [candidateName, setCandidateName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (roleId) getRole(roleId).then(setRole).catch(() => alert('Role not found'))
  }, [roleId])

  const startInterview = async () => {
    if (!roleId) return
    setLoading(true)
    try {
      const session = await createSession(roleId, candidateName || undefined)
      navigate(`/interview/${session.id}`)
    } catch {
      alert('Failed to start session')
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
      <h1>{role.title}</h1>

      {role.company_context && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <label style={{ color: '#888', fontSize: '0.85rem' }}>Company Context</label>
          <p style={{ marginTop: '0.25rem' }}>{role.company_context}</p>
        </div>
      )}

      <h2>Questions ({role.questions.length})</h2>
      {role.questions.map((q, i) => (
        <div key={i} className="card flex justify-between items-center">
          <span>{q.text}</span>
          <span className="tag">wt: {q.weight}</span>
        </div>
      ))}

      <div className="mt-2">
        <h2>Interview Config</h2>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <span className="tag">Style: {role.config.style}</span>
          <span className="tag">Follow-ups: {role.config.follow_up_depth}</span>
          {role.config.green_flags.map((f, i) => (
            <span key={i} className="tag" style={{ borderColor: '#065f46' }}>
              + {f}
            </span>
          ))}
          {role.config.red_flags.map((f, i) => (
            <span key={i} className="tag" style={{ borderColor: '#7f1d1d' }}>
              - {f}
            </span>
          ))}
        </div>
      </div>

      <div className="card mt-2">
        <h2>Start a Candidate Interview</h2>
        <input
          placeholder="Candidate name (optional)"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
        />
        <div className="flex gap-1">
          <button onClick={startInterview} disabled={loading}>
            {loading ? 'Starting...' : 'Start Interview'}
          </button>
          <button className="secondary" onClick={copyLink}>
            Copy Share Link
          </button>
        </div>
      </div>
    </div>
  )
}
