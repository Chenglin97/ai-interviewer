import { useRef, useState, useCallback, useEffect } from 'react'

interface Message {
  speaker: 'agent' | 'user'
  text: string
  scores?: Record<string, number>
}

interface UseVoiceChatOptions {
  wsUrl: string
  onComplete?: (data: any) => void
  onAgentMessage?: (data: any) => void
}

const SILENCE_TIMEOUT_MS = 1500

export function useVoiceChat({ wsUrl, onComplete, onAgentMessage }: UseVoiceChatOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [listening, setListening] = useState(false)
  const [connected, setConnected] = useState(false)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const recognitionRef = useRef<any>(null)
  const audioQueueRef = useRef<Blob[]>([])
  const playingRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const shouldListenRef = useRef(false)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)

  // Store callbacks in refs
  const onCompleteRef = useRef(onComplete)
  const onAgentMessageRef = useRef(onAgentMessage)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => { onAgentMessageRef.current = onAgentMessage }, [onAgentMessage])

  // Silence timeout refs
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTranscriptRef = useRef('')

  // Track what the agent was saying when interrupted
  const lastAgentTextRef = useRef('')
  const agentWasInterruptedRef = useRef(false)

  // --- Interrupt: stop agent audio immediately ---
  const interruptAgent = useCallback(() => {
    if (!playingRef.current && audioQueueRef.current.length === 0) return

    // Stop current audio
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch {}
      currentSourceRef.current = null
    }

    // Clear queued audio
    audioQueueRef.current = []
    playingRef.current = false
    setAgentSpeaking(false)
    agentWasInterruptedRef.current = true
  }, [])

  // --- Send pending transcript ---
  const flushTranscript = useCallback(() => {
    const text = pendingTranscriptRef.current.trim()
    if (text && wsRef.current?.readyState === WebSocket.OPEN) {
      // If agent was interrupted, prepend context
      let payload: any = { text }
      if (agentWasInterruptedRef.current && lastAgentTextRef.current) {
        payload.interrupted_context = `[Note: The user interrupted while you were saying: "${lastAgentTextRef.current}". They may be responding to part of what you said or wanting to move on.]`
        agentWasInterruptedRef.current = false
      }

      wsRef.current.send(JSON.stringify(payload))
      setMessages((prev) => [...prev, { speaker: 'user', text }])
      setThinking(true)
    }
    pendingTranscriptRef.current = ''
    setLiveTranscript('')
  }, [])

  // --- Audio playback queue ---
  const playNext = useCallback(async () => {
    if (playingRef.current || audioQueueRef.current.length === 0) return
    playingRef.current = true
    setAgentSpeaking(true)

    const blob = audioQueueRef.current.shift()!
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 })
      }
      const arrayBuffer = await blob.arrayBuffer()
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      currentSourceRef.current = source

      source.onended = () => {
        currentSourceRef.current = null
        playingRef.current = false
        setAgentSpeaking(false)
        playNext()
      }

      source.start()
    } catch {
      currentSourceRef.current = null
      playingRef.current = false
      setAgentSpeaking(false)
      playNext()
    }
  }, [])

  // --- WebSocket setup ---
  useEffect(() => {
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setListening(false)
      shouldListenRef.current = false
    }

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data)

        if (data.type === 'agent_text') {
          setMessages((prev) => [...prev, { speaker: 'agent', text: data.text, scores: data.scores }])
          setThinking(false)
          lastAgentTextRef.current = data.text
          onAgentMessageRef.current?.(data)
        } else if (data.type === 'transcript') {
          setMessages((prev) => [...prev, { speaker: 'user', text: data.text }])
        } else if (
          data.type === 'interview_complete' ||
          data.type === 'onboarding_complete'
        ) {
          shouldListenRef.current = false
          if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch {}
          }
          setListening(false)
          setThinking(false)
          onCompleteRef.current?.(data)
        } else if (data.type === 'status') {
          setMessages((prev) => [...prev, { speaker: 'agent', text: data.text }])
          setThinking(false)
        }
      } else if (event.data instanceof Blob) {
        audioQueueRef.current.push(event.data)
        playNext()
      }
    }

    return () => { ws.close() }
  }, [wsUrl, playNext])

  // --- Speech recognition ---
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition not supported. Use Chrome.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }

      // User started speaking — interrupt agent if it's talking
      if ((interim || final) && (playingRef.current || audioQueueRef.current.length > 0)) {
        interruptAgent()
      }

      // Clear any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }

      if (final.trim()) {
        pendingTranscriptRef.current = ''
        setLiveTranscript('')
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          let payload: any = { text: final.trim() }
          if (agentWasInterruptedRef.current && lastAgentTextRef.current) {
            payload.interrupted_context = `[Note: The user interrupted while you were saying: "${lastAgentTextRef.current}". They may be responding to part of what you said or wanting to move on.]`
            agentWasInterruptedRef.current = false
          }
          wsRef.current.send(JSON.stringify(payload))
          setMessages((prev) => [...prev, { speaker: 'user', text: final.trim() }])
          setThinking(true)
        }
      } else if (interim) {
        pendingTranscriptRef.current = interim
        setLiveTranscript(interim)

        silenceTimerRef.current = setTimeout(() => {
          flushTranscript()
        }, SILENCE_TIMEOUT_MS)
      }
    }

    recognition.onend = () => {
      if (pendingTranscriptRef.current.trim()) {
        flushTranscript()
      }
      if (shouldListenRef.current) {
        setTimeout(() => {
          if (shouldListenRef.current) {
            try { recognition.start() } catch {}
          }
        }, 100)
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        alert('Microphone permission denied')
        shouldListenRef.current = false
        setListening(false)
      }
    }

    recognitionRef.current = recognition
    shouldListenRef.current = true
    setListening(true)

    try { recognition.start() } catch {}
  }, [flushTranscript, interruptAgent])

  const stopListening = useCallback(() => {
    // Mute only — stop mic input but don't end the conversation
    shouldListenRef.current = false
    setListening(false)
    // Discard any pending speech (user is muting, not sending)
    pendingTranscriptRef.current = ''
    setLiveTranscript('')
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }, [listening, startListening, stopListening])

  const sendText = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current) return
    // Interrupt agent if speaking
    interruptAgent()
    wsRef.current.send(JSON.stringify({ text: text.trim() }))
    setMessages((prev) => [...prev, { speaker: 'user', text: text.trim() }])
    setThinking(true)
  }, [interruptAgent])

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [])

  return {
    messages,
    listening,
    connected,
    agentSpeaking,
    thinking,
    liveTranscript,
    toggleListening,
    sendText,
  }
}
