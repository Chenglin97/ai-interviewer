import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface Message {
  speaker: 'agent' | 'candidate'
  text: string
  scores?: { relevance?: number; depth?: number; authenticity?: number }
}

export default function Interview() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [recording, setRecording] = useState(false)
  const [connected, setConnected] = useState(false)
  const [textInput, setTextInput] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const transcriptRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws/interview/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data)

        if (data.type === 'agent_text') {
          setMessages((prev) => [...prev, { speaker: 'agent', text: data.text, scores: data.scores }])
        } else if (data.type === 'transcript') {
          setMessages((prev) => [...prev, { speaker: 'candidate', text: data.text }])
        } else if (data.type === 'interview_complete') {
          navigate(`/scorecard/${sessionId}`)
        }
      } else if (event.data instanceof Blob) {
        // Play agent audio
        try {
          if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({ sampleRate: 24000 })
          }
          const arrayBuffer = await event.data.arrayBuffer()
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
          const source = audioContextRef.current.createBufferSource()
          source.buffer = audioBuffer
          source.connect(audioContextRef.current.destination)
          source.start()
        } catch {
          // Audio playback failed — text still visible
        }
      }
    }

    return () => {
      ws.close()
    }
  }, [sessionId, navigate])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const toggleRecording = async () => {
    if (recording) {
      // Stop recording
      mediaRecorderRef.current?.stop()
      setRecording(false)
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data)
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then((buf) => wsRef.current?.send(buf))
          }
          stream.getTracks().forEach((t) => t.stop())
        }

        mediaRecorder.start()
        setRecording(true)
      } catch {
        alert('Microphone access denied')
      }
    }
  }

  const sendText = () => {
    if (!textInput.trim() || !wsRef.current) return
    wsRef.current.send(JSON.stringify({ text: textInput }))
    setMessages((prev) => [...prev, { speaker: 'candidate', text: textInput }])
    setTextInput('')
  }

  return (
    <div className="interview-container">
      <div className="flex justify-between items-center" style={{ padding: '0.5rem 0' }}>
        <h2 style={{ margin: 0 }}>Interview</h2>
        <span style={{ color: connected ? '#6ee7b7' : '#fca5a5', fontSize: '0.85rem' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="transcript" ref={transcriptRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.speaker}`}>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>
              {msg.speaker === 'agent' ? 'Interviewer' : 'You'}
            </div>
            {msg.text}
          </div>
        ))}
      </div>

      <div className="controls">
        <button
          className={`mic-btn ${recording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={!connected}
          title={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording ? '⏹' : '🎤'}
        </button>

        <input
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="Or type your response..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendText()}
          disabled={!connected}
        />
        <button onClick={sendText} disabled={!connected || !textInput.trim()} style={{ padding: '0.75rem 1rem' }}>
          Send
        </button>
      </div>
    </div>
  )
}
