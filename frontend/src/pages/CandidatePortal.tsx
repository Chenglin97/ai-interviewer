import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listRoles, createSession, type Role } from '../api'

export default function CandidatePortal() {
  const navigate = useNavigate()
  const [roles, setRoles] = useState<Role[]>([])
  const [selected, setSelected] = useState<Role | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    listRoles().then(setRoles).catch(() => {})
  }, [])

  const startInterview = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const session = await createSession(selected.id, name || undefined)
      navigate(`/interview/${session.id}`)
    } catch {
      alert('Failed to start interview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: '600px' }}>
      <h1>Open Positions</h1>
      <p style={{ color: '#888', marginBottom: '2rem' }}>
        Select a role to start your AI-powered voice interview.
      </p>

      {roles.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#666' }}>
          No open positions right now. Check back later.
        </div>
      ) : (
        roles.map((role) => (
          <div
            key={role.id}
            className="card"
            onClick={() => setSelected(role)}
            style={{
              cursor: 'pointer',
              border: selected?.id === role.id ? '1px solid #6366f1' : '1px solid #222',
              transition: 'border-color 0.2s',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{role.title}</h2>
            {role.company_context && (
              <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.35rem' }}>{role.company_context}</p>
            )}
            <div className="flex gap-1 mt-1" style={{ flexWrap: 'wrap' }}>
              <span className="tag">{role.questions.length} question{role.questions.length !== 1 ? 's' : ''}</span>
              <span className="tag">{role.config.style || 'conversational'}</span>
            </div>
          </div>
        ))
      )}

      {selected && (
        <div className="card" style={{ marginTop: '1.5rem', border: '1px solid #6366f1' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Ready to interview for {selected.title}?</h2>
          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '1rem' }}>
            This is a voice interview powered by AI. You'll have a natural conversation — no trick questions.
            Use Chrome for the best experience.
          </p>
          <button onClick={startInterview} disabled={loading || !name.trim()} style={{ width: '100%' }}>
            {loading ? 'Starting...' : 'Start Interview'}
          </button>
        </div>
      )}
    </div>
  )
}
