import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSession, getScorecard, getTranscript, type Session, type TranscriptMessage } from '../api'

function scoreClass(score: number, max: number = 5) {
  const pct = score / max
  if (pct >= 0.7) return 'score-high'
  if (pct >= 0.4) return 'score-mid'
  return 'score-low'
}

function ScoreBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = (value / max) * 100
  const color = pct >= 70 ? '#6ee7b7' : pct >= 40 ? '#fcd34d' : '#fca5a5'
  return (
    <div style={{ marginBottom: '0.35rem' }}>
      <div className="flex justify-between" style={{ fontSize: '0.75rem', marginBottom: '0.15rem' }}>
        <span style={{ color: '#888' }}>{label}</span>
        <span style={{ color }}>{value}/{max}</span>
      </div>
      <div style={{ height: '4px', background: '#222', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

export default function Review() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [scorecard, setScorecard] = useState<any>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [tab, setTab] = useState<'transcript' | 'scorecard'>('transcript')

  useEffect(() => {
    if (!sessionId) return
    getSession(sessionId).then(setSession).catch(() => {})
    getScorecard(sessionId).then(setScorecard).catch(() => {})
    getTranscript(sessionId).then(setTranscript).catch(() => {})
  }, [sessionId])

  if (!session) return <div className="container">Loading...</div>

  return (
    <div className="container">
      <Link to={`/roles/${session.role_id}`} style={{ color: '#888', textDecoration: 'none', fontSize: '0.85rem' }}>
        &larr; Back to Role
      </Link>

      <h1 style={{ marginTop: '0.5rem' }}>
        {session.candidate_name || 'Anonymous'} — Review
      </h1>

      <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        {session.status}
        {session.started_at && ` \u00b7 ${new Date(session.started_at).toLocaleString()}`}
        {session.ended_at && ` \u2014 ${new Date(session.ended_at).toLocaleTimeString()}`}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-2">
        <button
          className={tab === 'transcript' ? '' : 'secondary'}
          onClick={() => setTab('transcript')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          Conversation ({transcript.length})
        </button>
        <button
          className={tab === 'scorecard' ? '' : 'secondary'}
          onClick={() => setTab('scorecard')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          Scorecard
        </button>
      </div>

      {/* Transcript tab */}
      {tab === 'transcript' && (
        <div>
          {transcript.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: '#888' }}>No transcript available.</div>
          ) : (
            transcript.map((msg, i) => (
              <div key={i} style={{ marginBottom: '1rem' }}>
                {/* Message bubble */}
                <div className={`message ${msg.speaker}`} style={{ maxWidth: '100%' }}>
                  <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 600 }}>
                      {msg.speaker === 'agent' ? 'Interviewer' : 'Candidate'}
                    </span>
                    {msg.timestamp && (
                      <span style={{ fontSize: '0.7rem', color: '#555' }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <div style={{ lineHeight: '1.5' }}>{msg.text}</div>
                </div>

                {/* Agent's internal thought process — shown below agent messages */}
                {msg.speaker === 'agent' && msg.scores && (
                  <div style={{
                    marginTop: '0.35rem',
                    marginLeft: '0.5rem',
                    padding: '0.75rem',
                    background: '#0d0d1a',
                    border: '1px solid #1a1a2e',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                  }}>
                    <div style={{ color: '#6366f1', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Agent Thought Process
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      {msg.scores.relevance != null && <ScoreBar label="Relevance" value={msg.scores.relevance} />}
                      {msg.scores.depth != null && <ScoreBar label="Depth" value={msg.scores.depth} />}
                      {msg.scores.authenticity != null && <ScoreBar label="Authenticity" value={msg.scores.authenticity} />}
                    </div>
                    {(msg.scores as any).notes && (
                      <div style={{ color: '#999', fontStyle: 'italic', lineHeight: '1.4' }}>
                        "{(msg.scores as any).notes}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Scorecard tab */}
      {tab === 'scorecard' && scorecard && (
        <>
          <div className="card flex items-center gap-2" style={{ marginBottom: '1rem' }}>
            <div
              className={`score-badge ${scoreClass(scorecard.overall_score, 10)}`}
              style={{ width: '4rem', height: '4rem', fontSize: '1.5rem', flexShrink: 0 }}
            >
              {scorecard.overall_score}
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: '#888' }}>Overall Score (out of 10)</div>
              <p style={{ marginTop: '0.5rem' }}>{scorecard.summary}</p>
            </div>
          </div>

          {scorecard.per_question?.map((q: any, i: number) => (
            <div key={i} className="card">
              <div className="flex justify-between items-center">
                <strong style={{ fontSize: '0.9rem' }}>{q.question}</strong>
                <div className="flex gap-1 items-center">
                  {q.authenticity_flag && (
                    <span className="tag" style={{ borderColor: '#7f1d1d', color: '#fca5a5', fontSize: '0.7rem' }}>
                      Authenticity concern
                    </span>
                  )}
                  <span className={`score-badge ${scoreClass(q.score)}`}>{q.score}</span>
                </div>
              </div>
              <p style={{ color: '#888', marginTop: '0.5rem', fontSize: '0.85rem' }}>{q.notes}</p>
            </div>
          ))}

          {scorecard.strengths?.length > 0 && (
            <div className="card mt-1">
              <h2 style={{ fontSize: '1rem', color: '#6ee7b7' }}>Strengths</h2>
              <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0 0' }}>
                {scorecard.strengths.map((s: string, i: number) => (
                  <li key={i} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {scorecard.concerns?.length > 0 && (
            <div className="card mt-1">
              <h2 style={{ fontSize: '1rem', color: '#fca5a5' }}>Concerns</h2>
              <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0 0' }}>
                {scorecard.concerns.map((c: string, i: number) => (
                  <li key={i} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {scorecard.recommendation && (
            <div className="card mt-1" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: '#888' }}>Recommendation</div>
              <div style={{
                fontSize: '1.2rem',
                fontWeight: 'bold',
                marginTop: '0.25rem',
                color: scorecard.recommendation.includes('yes') ? '#6ee7b7' :
                       scorecard.recommendation.includes('no') ? '#fca5a5' : '#fcd34d',
              }}>
                {scorecard.recommendation.replace(/_/g, ' ').toUpperCase()}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'scorecard' && !scorecard && (
        <div className="card" style={{ textAlign: 'center', color: '#888' }}>
          No scorecard available yet.
        </div>
      )}
    </div>
  )
}
