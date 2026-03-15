import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRoles, type Role } from './api'

export default function App() {
  const [roles, setRoles] = useState<Role[]>([])

  useEffect(() => {
    listRoles().then(setRoles).catch(() => {})
  }, [])

  return (
    <div className="container">
      <h1>AI Interviewer</h1>
      <p style={{ marginBottom: '2rem', color: '#888' }}>
        Create intelligent voice interviewers that adapt, probe, and detect authenticity.
      </p>

      <div className="flex gap-1" style={{ marginBottom: '2rem' }}>
        <Link to="/roles/new">
          <button>Set Up New Interviewer</button>
        </Link>
        <Link to="/careers">
          <button className="secondary">Candidate Portal</button>
        </Link>
      </div>

      {roles.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: '#666' }}>
          No roles yet. Create one to get started.
        </div>
      ) : (
        roles.map((role) => (
          <Link key={role.id} to={`/roles/${role.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ cursor: 'pointer' }}>
              <div className="flex justify-between items-center">
                <div>
                  <h2 style={{ margin: 0 }}>{role.title}</h2>
                  <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    {role.questions.length} question{role.questions.length !== 1 ? 's' : ''} &middot; {role.config.style}
                  </p>
                </div>
                <span style={{ color: '#6366f1', fontSize: '1.5rem' }}>&rarr;</span>
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  )
}
