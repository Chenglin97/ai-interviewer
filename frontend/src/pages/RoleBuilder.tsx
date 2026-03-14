import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRole, type Question } from '../api'

export default function RoleBuilder() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [questions, setQuestions] = useState<Question[]>([{ text: '', weight: 1 }])
  const [style, setStyle] = useState('conversational')
  const [followUpDepth, setFollowUpDepth] = useState(2)
  const [greenFlags, setGreenFlags] = useState('')
  const [redFlags, setRedFlags] = useState('')
  const [loading, setLoading] = useState(false)

  const addQuestion = () => setQuestions([...questions, { text: '', weight: 1 }])

  const updateQuestion = (i: number, field: keyof Question, value: string | number) => {
    const updated = [...questions]
    updated[i] = { ...updated[i], [field]: value }
    setQuestions(updated)
  }

  const removeQuestion = (i: number) => {
    if (questions.length > 1) setQuestions(questions.filter((_, idx) => idx !== i))
  }

  const handleSubmit = async () => {
    if (!title.trim() || !questions.some((q) => q.text.trim())) return
    setLoading(true)
    try {
      const role = await createRole({
        title,
        company_context: context || undefined,
        questions: questions.filter((q) => q.text.trim()),
        config: {
          style,
          follow_up_depth: followUpDepth,
          green_flags: greenFlags.split(',').map((s) => s.trim()).filter(Boolean),
          red_flags: redFlags.split(',').map((s) => s.trim()).filter(Boolean),
        },
      })
      navigate(`/roles/${role.id}`)
    } catch {
      alert('Failed to create role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>Create Interview Role</h1>

      <label style={{ color: '#888', fontSize: '0.85rem' }}>Role Title *</label>
      <input
        placeholder="e.g. Senior Backend Engineer"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label style={{ color: '#888', fontSize: '0.85rem' }}>Company Context</label>
      <textarea
        placeholder="Tell the interviewer about your company, team, and what matters..."
        value={context}
        onChange={(e) => setContext(e.target.value)}
      />

      <div className="flex justify-between items-center mb-2">
        <h2>Questions</h2>
        <button className="secondary" onClick={addQuestion} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
          + Add
        </button>
      </div>

      {questions.map((q, i) => (
        <div key={i} className="card flex gap-2 items-center">
          <div style={{ flex: 1 }}>
            <input
              placeholder={`Question ${i + 1}`}
              value={q.text}
              onChange={(e) => updateQuestion(i, 'text', e.target.value)}
              style={{ marginBottom: 0 }}
            />
          </div>
          <div style={{ width: '80px' }}>
            <select
              value={q.weight}
              onChange={(e) => updateQuestion(i, 'weight', parseInt(e.target.value))}
              style={{
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.9rem',
              }}
            >
              {[1, 2, 3].map((w) => (
                <option key={w} value={w}>
                  wt: {w}
                </option>
              ))}
            </select>
          </div>
          {questions.length > 1 && (
            <button
              className="secondary"
              onClick={() => removeQuestion(i)}
              style={{ padding: '0.5rem', fontSize: '0.85rem' }}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      <div className="mt-2">
        <h2>Interview Settings</h2>
        <div className="flex gap-2 mb-2">
          <div style={{ flex: 1 }}>
            <label style={{ color: '#888', fontSize: '0.85rem' }}>Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              style={{
                width: '100%',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '0.75rem',
              }}
            >
              <option value="conversational">Conversational</option>
              <option value="structured">Structured</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#888', fontSize: '0.85rem' }}>Follow-up Depth</label>
            <select
              value={followUpDepth}
              onChange={(e) => setFollowUpDepth(parseInt(e.target.value))}
              style={{
                width: '100%',
                background: '#1e1e2e',
                color: '#e0e0e0',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '0.75rem',
              }}
            >
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {d} follow-up{d > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label style={{ color: '#888', fontSize: '0.85rem' }}>Green Flags (comma-separated)</label>
        <input
          placeholder="e.g. asks clarifying questions, mentions trade-offs"
          value={greenFlags}
          onChange={(e) => setGreenFlags(e.target.value)}
        />

        <label style={{ color: '#888', fontSize: '0.85rem' }}>Red Flags (comma-separated)</label>
        <input
          placeholder="e.g. vague on details, can't explain decisions"
          value={redFlags}
          onChange={(e) => setRedFlags(e.target.value)}
        />
      </div>

      <button onClick={handleSubmit} disabled={loading || !title.trim()} style={{ width: '100%', marginTop: '1rem' }}>
        {loading ? 'Creating...' : 'Create Interview Role'}
      </button>
    </div>
  )
}
