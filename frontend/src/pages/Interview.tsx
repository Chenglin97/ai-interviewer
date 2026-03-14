import { useRef, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useVoiceChat } from '../hooks/useVoiceChat'

export default function Interview() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [textInput, setTextInput] = useState('')

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const wsUrl = `${protocol}://${window.location.host}/api/ws/interview/${sessionId}`

  const {
    messages, listening, connected, agentSpeaking, thinking, liveTranscript,
    toggleListening, sendText,
  } = useVoiceChat({
    wsUrl,
    onComplete: (data) => {
      if (data.type === 'interview_complete') {
        navigate(`/scorecard/${sessionId}`)
      }
    },
  })

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, liveTranscript])

  const handleSendText = () => {
    sendText(textInput)
    setTextInput('')
  }

  return (
    <div className="interview-container">
      <div className="flex justify-between items-center" style={{ padding: '0.5rem 0' }}>
        <h2 style={{ margin: 0 }}>Interview</h2>
        <div className="flex items-center gap-1">
          {agentSpeaking && (
            <span style={{ color: '#6366f1', fontSize: '0.85rem', animation: 'pulse 1.5s infinite' }}>
              Speaking...
            </span>
          )}
          {thinking && (
            <span style={{ color: '#fcd34d', fontSize: '0.85rem' }}>
              Thinking...
            </span>
          )}
          <span style={{ color: connected ? '#6ee7b7' : '#fca5a5', fontSize: '0.85rem' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="transcript" ref={transcriptRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.speaker === 'agent' ? 'agent' : 'candidate'}`}>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
              {msg.speaker === 'agent' ? 'Interviewer' : 'You'}
            </div>
            {msg.text}
          </div>
        ))}
        {liveTranscript && (
          <div className="message candidate" style={{ opacity: 0.5, fontStyle: 'italic' }}>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>You</div>
            {liveTranscript}...
          </div>
        )}
        {thinking && (
          <div className="message agent" style={{ opacity: 0.6 }}>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>Interviewer</div>
            <span className="thinking-dots">Thinking</span>
          </div>
        )}
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
