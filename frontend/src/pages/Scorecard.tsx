import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getScorecard } from '../api'

interface ScorecardData {
  session_id: string
  summary: string
  overall_score: number
  per_question: Array<{
    question: string
    score: number
    notes: string
    authenticity_flag?: boolean
  }>
}

function scoreClass(score: number, max: number = 5) {
  const pct = score / max
  if (pct >= 0.7) return 'score-high'
  if (pct >= 0.4) return 'score-mid'
  return 'score-low'
}

export default function Scorecard() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [data, setData] = useState<ScorecardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionId) {
      getScorecard(sessionId).then(setData).catch(() => setError('Scorecard not ready yet'))
    }
  }, [sessionId])

  if (error) {
    return (
      <div className="container">
        <h1>Scorecard</h1>
        <div className="card" style={{ textAlign: 'center', color: '#888' }}>
          {error}
        </div>
        <Link to="/">
          <button className="secondary mt-2">Back to Home</button>
        </Link>
      </div>
    )
  }

  if (!data) return <div className="container">Loading scorecard...</div>

  return (
    <div className="container">
      <h1>Interview Scorecard</h1>

      <div className="card flex items-center gap-2" style={{ marginBottom: '1.5rem' }}>
        <div className={`score-badge ${scoreClass(data.overall_score, 10)}`} style={{ width: '4rem', height: '4rem', fontSize: '1.5rem' }}>
          {data.overall_score}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>Overall Score (out of 10)</div>
          <p style={{ marginTop: '0.5rem' }}>{data.summary}</p>
        </div>
      </div>

      <h2>Per-Question Breakdown</h2>
      {data.per_question.map((q, i) => (
        <div key={i} className="card">
          <div className="flex justify-between items-center">
            <strong>{q.question}</strong>
            <div className="flex gap-1 items-center">
              {q.authenticity_flag && (
                <span className="tag" style={{ borderColor: '#7f1d1d', color: '#fca5a5', fontSize: '0.75rem' }}>
                  Authenticity concern
                </span>
              )}
              <span className={`score-badge ${scoreClass(q.score)}`}>{q.score}</span>
            </div>
          </div>
          <p style={{ color: '#888', marginTop: '0.5rem', fontSize: '0.9rem' }}>{q.notes}</p>
        </div>
      ))}

      <Link to="/">
        <button className="secondary mt-2">Back to Home</button>
      </Link>
    </div>
  )
}
