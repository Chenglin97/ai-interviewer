import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { generateRole } from '../api'

interface ExtractedData {
  title?: string
  company_context?: string
  questions?: Array<{ text: string; weight: number }>
  style?: string
  follow_up_depth?: number
  green_flags?: string[]
  red_flags?: string[]
}

const STORAGE_KEY = 'onboarding_draft'

function loadDraft(): { extracted: ExtractedData; status: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveDraft(extracted: ExtractedData, status: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ extracted, status }))
}

function clearDraft() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export default function RoleBuilder() {
  const navigate = useNavigate()
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [textInput, setTextInput] = useState('')
  const draft = loadDraft()
  const [extracted, setExtracted] = useState<ExtractedData>(draft?.extracted ?? {})
  const [status, setStatus] = useState(draft?.status ?? 'gathering')
  const [generating, setGenerating] = useState(false)
  const [resumed, setResumed] = useState(!!draft)

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const wsUrl = `${protocol}://${window.location.host}/api/ws/onboarding`

  const {
    messages, listening, connected, agentSpeaking, thinking, liveTranscript, sendCountdown,
    toggleListening, sendText,
  } = useVoiceChat({
    wsUrl,
    onComplete: (data) => {
      if (data.type === 'onboarding_complete') {
        clearDraft()
        navigate(`/roles/${data.role_id}`)
      }
    },
    onAgentMessage: (data) => {
      if (data.extracted) {
        setExtracted(data.extracted)
        saveDraft(data.extracted, data.status || 'gathering')
      }
      if (data.status) setStatus(data.status)
      setResumed(false) // no longer showing resumed banner once new data comes in
    },
  })

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, liveTranscript])

  const handleSendText = () => {
    sendText(textInput)
    setTextInput('')
  }

  const canGenerate = !!(extracted.title && extracted.questions?.length)

  const handleGenerateAgent = async () => {
    if (!canGenerate) return
    setGenerating(true)
    try {
      const result = await generateRole(extracted)
      clearDraft()
      navigate(`/roles/${result.role_id}`)
    } catch {
      alert('Failed to generate agent. Try again.')
      setGenerating(false)
    }
  }

  const handleClearDraft = () => {
    clearDraft()
    setExtracted({})
    setStatus('gathering')
    setResumed(false)
  }

  return (
    <div className="interview-container">
      <div className="flex justify-between items-center" style={{ padding: '0.5rem 0' }}>
        <div>
          <h2 style={{ margin: 0 }}>Set Up Your Interviewer</h2>
          <span style={{ fontSize: '0.8rem', color: '#888' }}>
            {generating ? 'Generating your agent...' :
             status === 'gathering' ? 'Tell me about the role...' :
             status === 'confirming' ? 'Reviewing your setup...' :
             status === 'complete' ? 'Ready to generate!' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {agentSpeaking && (
            <span style={{ color: '#6366f1', fontSize: '0.85rem' }}>Speaking...</span>
          )}
          <span style={{ color: connected ? '#6ee7b7' : '#fca5a5', fontSize: '0.85rem' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Resumed draft banner */}
      {resumed && canGenerate && (
        <div className="card" style={{ marginBottom: '0.5rem', padding: '0.75rem', background: '#1a1a2e', border: '1px solid #6366f1' }}>
          <div className="flex justify-between items-center">
            <div style={{ fontSize: '0.85rem' }}>
              Previous session found: <strong>{extracted.title}</strong> with {extracted.questions?.length} question{(extracted.questions?.length ?? 0) !== 1 ? 's' : ''}
            </div>
            <div className="flex gap-1">
              <button onClick={handleGenerateAgent} disabled={generating} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                {generating ? 'Generating...' : 'Generate Agent'}
              </button>
              <button className="secondary" onClick={handleClearDraft} style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: '1rem', overflow: 'hidden' }}>
        {/* Conversation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="transcript" ref={transcriptRef} style={{ flex: 1 }}>
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.speaker === 'agent' ? 'agent' : 'candidate'}`}>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
                  {msg.speaker === 'agent' ? 'AI Assistant' : 'You'}
                </div>
                {msg.text}
              </div>
            ))}
            {liveTranscript && (
              <div className="message candidate" style={{ opacity: 0.5, fontStyle: 'italic' }}>
                <div className="flex justify-between" style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
                  <span>You</span>
                  {sendCountdown != null && (
                    <span style={{ color: sendCountdown <= 1 ? '#fca5a5' : '#fcd34d' }}>
                      Sending in {sendCountdown.toFixed(1)}s
                    </span>
                  )}
                </div>
                {liveTranscript}...
              </div>
            )}
            {thinking && (
              <div className="message agent" style={{ opacity: 0.6 }}>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>AI Assistant</div>
                <span className="thinking-dots">Thinking</span>
              </div>
            )}
          </div>
        </div>

        {/* Live extraction sidebar */}
        <div style={{ width: '280px', flexShrink: 0, overflowY: 'auto' }}>
          <div className="card" style={{ fontSize: '0.85rem' }}>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Building Config</h2>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem' }}>Role</div>
              <div>{extracted.title || '—'}</div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem' }}>Company</div>
              <div>{extracted.company_context || '—'}</div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem' }}>Questions</div>
              {extracted.questions?.length ? (
                extracted.questions.map((q, i) => (
                  <div key={i} style={{ padding: '0.25rem 0', borderBottom: '1px solid #222' }}>
                    <span>{q.text}</span>
                    <span className="tag" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>wt:{q.weight}</span>
                  </div>
                ))
              ) : (
                <span>—</span>
              )}
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem' }}>Style</div>
              <div>{extracted.style || '—'}</div>
            </div>

            {(extracted.green_flags?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ color: '#888', fontSize: '0.75rem' }}>Green Flags</div>
                {extracted.green_flags!.map((f, i) => (
                  <span key={i} className="tag" style={{ borderColor: '#065f46', fontSize: '0.75rem' }}>+ {f}</span>
                ))}
              </div>
            )}

            {(extracted.red_flags?.length ?? 0) > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ color: '#888', fontSize: '0.75rem' }}>Red Flags</div>
                {extracted.red_flags!.map((f, i) => (
                  <span key={i} className="tag" style={{ borderColor: '#7f1d1d', fontSize: '0.75rem' }}>- {f}</span>
                ))}
              </div>
            )}

            {/* Generate Agent button */}
            <button
              onClick={handleGenerateAgent}
              disabled={!canGenerate || generating}
              style={{
                width: '100%',
                marginTop: '0.75rem',
                padding: '0.6rem',
                fontSize: '0.9rem',
                opacity: canGenerate && !generating ? 1 : 0.4,
              }}
            >
              {generating ? 'Generating...' : 'Generate Agent'}
            </button>
            {!canGenerate && (
              <div style={{ color: '#555', fontSize: '0.7rem', marginTop: '0.35rem', textAlign: 'center' }}>
                Need at least a title and one question
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="controls">
        <button
          className={`mic-btn ${listening ? 'recording' : ''}`}
          onClick={toggleListening}
          disabled={!connected}
          title={listening ? 'Mute mic' : 'Unmute mic'}
        >
          {listening ? '🔴' : '🎤'}
        </button>

        {listening ? (
          <div style={{ flex: 1, textAlign: 'center', color: '#888', fontSize: '0.9rem' }}>
            {agentSpeaking
              ? 'Agent is speaking — talk to interrupt'
              : thinking
                ? 'Processing your response...'
                : sendCountdown != null
                  ? `Sending in ${sendCountdown.toFixed(1)}s — keep talking to reset`
                  : liveTranscript
                    ? 'Listening...'
                    : 'Speak naturally — I\'m listening'}
          </div>
        ) : (
          <>
            <input
              style={{ flex: 1, marginBottom: 0 }}
              placeholder="Type or click the mic for voice mode"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              disabled={!connected}
            />
            <button onClick={handleSendText} disabled={!connected || !textInput.trim()} style={{ padding: '0.75rem 1rem' }}>
              Send
            </button>
          </>
        )}
      </div>
    </div>
  )
}
