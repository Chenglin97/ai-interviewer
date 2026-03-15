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

const SILENCE_TIMEOUT_MS = 3000 // 3s of silence before sending
const COUNTDOWN_INTERVAL_MS = 100 // Update countdown every 100ms

export function useVoiceChat({ wsUrl, onComplete, onAgentMessage }: UseVoiceChatOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [listening, setListening] = useState(false)
  const [connected, setConnected] = useState(false)
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [sendCountdown, setSendCountdown] = useState<number | null>(null) // seconds remaining

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
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const silenceStartRef = useRef<number>(0)
  const pendingTranscriptRef = useRef('')
  const justSentRef = useRef(false) // prevent duplicate sends

  // Track what the agent was saying when interrupted
  const lastAgentTextRef = useRef('')
  const agentWasInterruptedRef = useRef(false)

  // --- Clear all timers ---
  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setSendCountdown(null)
  }, [])

  // --- Interrupt: stop agent audio immediately ---
  const interruptAgent = useCallback(() => {
    if (!playingRef.current && audioQueueRef.current.length === 0) return

    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch {}
      currentSourceRef.current = null
    }

    audioQueueRef.current = []
    playingRef.current = false
    setAgentSpeaking(false)
    agentWasInterruptedRef.current = true
  }, [])

  // --- Send helper (with dedup) ---
  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current?.readyState || wsRef.current.readyState !== WebSocket.OPEN) return

    let payload: any = { text: text.trim() }
    if (agentWasInterruptedRef.current && lastAgentTextRef.current) {
      payload.interrupted_context = `[Note: The user interrupted while you were saying: "${lastAgentTextRef.current}". They may be responding to part of what you said or wanting to move on.]`
      agentWasInterruptedRef.current = false
    }

    wsRef.current.send(JSON.stringify(payload))
    setMessages((prev) => [...prev, { speaker: 'user', text: text.trim() }])
    setThinking(true)
    justSentRef.current = true
    // Reset after a short window to allow next send
    setTimeout(() => { justSentRef.current = false }, 500)
  }, [])

  // --- Send pending transcript ---
  const flushTranscript = useCallback(() => {
    clearTimers()
    if (justSentRef.current) {
      // Already sent via isFinal — skip duplicate
      pendingTranscriptRef.current = ''
      setLiveTranscript('')
      return
    }
    const text = pendingTranscriptRef.current.trim()
    if (text) {
      sendMessage(text)
    }
    pendingTranscriptRef.current = ''
    setLiveTranscript('')
  }, [clearTimers, sendMessage])

  // --- Start silence countdown ---
  const startSilenceCountdown = useCallback(() => {
    clearTimers()

    silenceStartRef.current = Date.now()

    // Countdown display
    countdownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - silenceStartRef.current
      const remaining = Math.max(0, (SILENCE_TIMEOUT_MS - elapsed) / 1000)
      setSendCountdown(Math.round(remaining * 10) / 10)
    }, COUNTDOWN_INTERVAL_MS)

    // Actual send timer
    silenceTimerRef.current = setTimeout(() => {
      flushTranscript()
    }, SILENCE_TIMEOUT_MS)
  }, [clearTimers, flushTranscript])

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

      if (final.trim()) {
        // Got a final result — send immediately and cancel any pending timer
        clearTimers()
        pendingTranscriptRef.current = ''
        setLiveTranscript('')
        sendMessage(final.trim())
      } else if (interim) {
        // Interim result — accumulate and reset the silence countdown
        pendingTranscriptRef.current = interim
        setLiveTranscript(interim)
        startSilenceCountdown()
      }
    }

    recognition.onend = () => {
      // If there's pending text and no timer running, flush it
      if (pendingTranscriptRef.current.trim() && !silenceTimerRef.current) {
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
  }, [flushTranscript, interruptAgent, sendMessage, startSilenceCountdown, clearTimers])

  const stopListening = useCallback(() => {
    shouldListenRef.current = false
    setListening(false)
    pendingTranscriptRef.current = ''
    setLiveTranscript('')
    clearTimers()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
  }, [clearTimers])

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }, [listening, startListening, stopListening])

  const sendText = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current) return
    interruptAgent()
    sendMessage(text.trim())
  }, [interruptAgent, sendMessage])

  useEffect(() => {
    return () => { clearTimers() }
  }, [clearTimers])

  return {
    messages,
    listening,
    connected,
    agentSpeaking,
    thinking,
    liveTranscript,
    sendCountdown,
    toggleListening,
    sendText,
  }
}
