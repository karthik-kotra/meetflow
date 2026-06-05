import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  MessageSquare, Users, CalendarDays, Clock, ArrowLeft,
  Copy, Check, Info, Settings, Camera, Lock,
  FileText, History, Smile, Hand, Send, Menu, X,
  Maximize2, Minimize2, Search, Sparkles
} from 'lucide-react'
import { useMeetings } from '@/context/MeetingsContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { format, parseISO } from 'date-fns'
import { io } from 'socket.io-client'

// Video Renderer Component
function VideoView({ stream, name, muted, isLocal, isVideoOn, isAudioOn, isHandRaised, mirror = false, isPinned = false, onTogglePin, lastTranscript }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(e => console.warn("Video play failed:", e))
    }
  }, [stream])

  return (
    <div className="relative bg-card rounded-xl border border-border overflow-hidden flex items-center justify-center aspect-video shadow-md hover:shadow-lg transition-all duration-200 w-full h-full group/video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        data-is-local={isLocal}
        data-name={name}
        data-video-on={isVideoOn && !!stream}
        data-audio-on={isAudioOn}
        data-hand-raised={isHandRaised}
        className={`w-full h-full object-cover ${mirror ? 'transform scale-x-[-1]' : ''} ${(isVideoOn && stream) ? 'block' : 'opacity-0 absolute inset-0 pointer-events-none'}`}
      />
      {isHandRaised && (
        <div className="absolute top-2 right-2 bg-amber-500 text-white p-1.5 rounded-lg shadow-md flex items-center justify-center animate-bounce z-10 border border-amber-400/20">
          <Hand size={13} className="fill-white" />
        </div>
      )}
      {(!isVideoOn || !stream) && (
        <div className="w-full h-full bg-gradient-to-br from-secondary/80 to-muted flex flex-col items-center justify-center gap-3 absolute inset-0">
          <Avatar className="w-16 h-16 border-2 border-border shadow-lg">
            <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
              {name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground font-semibold">Camera is off</span>
        </div>
      )}
      
      {/* Pin / Maximize Button */}
      {onTogglePin && (
        <button
          onClick={onTogglePin}
          className="absolute top-2 left-2 bg-background/85 hover:bg-primary/95 text-foreground hover:text-white p-1.5 rounded-lg border border-border/40 shadow-md backdrop-blur-sm transition-all z-20 cursor-pointer opacity-0 group-hover/video:opacity-100 focus:opacity-100"
          title={isPinned ? "Unpin Spotlight" : "Pin/Maximize Screen"}
        >
          {isPinned ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      )}


      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 select-none border border-border/40">
        {isAudioOn ? (
          <Mic size={11} className="text-primary" />
        ) : (
          <MicOff size={11} className="text-destructive animate-pulse" />
        )}
        <span className="text-xs font-display font-medium">
          {name} {isLocal && '(You)'}
        </span>
      </div>
    </div>
  )
}

export default function MeetingRoomPage() {
  const { id } = useParams()
  const { fetchMeetingDetails, updateMeetingStatus, processMeetingAI } = useMeetings()
  const { user } = useAuth()
  const { updateStatus } = useChat() || {}
  const navigate = useNavigate()

  // State Management
  const [meeting, setMeeting] = useState(null)
  const [loadingMeeting, setLoadingMeeting] = useState(true)
  const [meetingError, setMeetingError] = useState(null)
  const [pinnedPeer, setPinnedPeer] = useState(null)
  const [joined, setJoined] = useState(false)
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [screen, setScreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState("info")
  const [elapsed, setElapsed] = useState(0)
  const [showSidebar, setShowSidebar] = useState(true)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState("")
  const [typingUsers, setTypingUsers] = useState([])
  const [unreadChat, setUnreadChat] = useState(0)
  const [raisedHands, setRaisedHands] = useState(new Set())
  const [myHandRaised, setMyHandRaised] = useState(false)
  const [sharedNotes, setSharedNotes] = useState("")
  const [notesSaveStatus, setNotesSaveStatus] = useState("saved")
  const [floatingReactions, setFloatingReactions] = useState([])
  const [activityFeed, setActivityFeed] = useState([])
  const [toasts, setToasts] = useState([])
  const [peers, setPeers] = useState([])
  const [localTranscript, setLocalTranscript] = useState("")
  const typingTimeoutRef = useRef(null)
  const notesTimeoutRef = useRef(null)
  const localTranscriptTimeoutRef = useRef(null)
  const peerTranscriptTimeoutsRef = useRef(new Map())
  // Hardware Devices
  const [videoDevices, setVideoDevices] = useState([])
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedVideo, setSelectedVideo] = useState('')
  const [selectedAudio, setSelectedAudio] = useState('')
  
  // Real-Time Audio Level Preview
  const [micLevel, setMicLevel] = useState(0)

  // Media Streams & WebRTC Sockets References
  const [localStream, setLocalStream] = useState(null)
  const socketRef = useRef(null)
  const peerConnectionsRef = useRef(new Map()) // Map of socketId -> RTCPeerConnection
  const localStreamRef = useRef(null)
  const lobbyVideoRef = useRef(null)
  const localVideoTrackRef = useRef(null)
  const peersRef = useRef([])

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    peersRef.current = peers
  }, [peers])

  useEffect(() => {
    if (lobbyVideoRef.current && localStream) {
      lobbyVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  const addToast = (text, type = 'info') => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setActivityFeed(prev => [...prev, { id, text, type, time: timeString }])
  }

  // Completed Dashboard State Management & Handlers
  const [completedTab, setCompletedTab] = useState("overview")
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("")
  const [aiProcessing, setAiProcessing] = useState(false)
  const [syncStatus, setSyncStatus] = useState({})
  const [completedLogs, setCompletedLogs] = useState([])
  const [completedLogsLoading, setCompletedLogsLoading] = useState(false)
  const [transcriptSearch, setTranscriptSearch] = useState("")
  const [aiTranscribe, setAiTranscribe] = useState(false)
  const [chatSummary, setChatSummary] = useState("")
  const [summarizingChats, setSummarizingChats] = useState(false)
  const [syncingTask, setSyncingTask] = useState(null)

  // Recording State Management
  const [recordingState, setRecordingState] = useState('idle') // 'idle' | 'recording' | 'uploading' | 'processing' | 'success' | 'error'
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const recordingRafRef = useRef(null)
  const recordingAudioCtxRef = useRef(null)
  const connectedAudioTracksRef = useRef(new Set())
  const navigateAfterUploadRef = useRef(false)

  // Start recording meeting stream using canvas compositor and mixed audio destination
  const startRecording = async () => {
    // Clear chunk list
    recordedChunksRef.current = []
    connectedAudioTracksRef.current.clear()

    // 1. Initialize AudioContext for mixing
    let audioCtx;
    let audioDest;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      recordingAudioCtxRef.current = audioCtx
      audioDest = audioCtx.createMediaStreamDestination()
      
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }
    } catch (err) {
      console.error('Failed to initialize AudioContext:', err)
      addToast('Failed to initialize audio recorder: ' + err.message, 'error')
      setRecordingState('error')
      return
    }

    // 2. Create offscreen Canvas for video compositing
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')

    // 3. Define the draw & mix loop (running on requestAnimationFrame)
    const drawAndMixFrame = () => {
      // Find all participant video elements in DOM
      const videos = Array.from(document.querySelectorAll('video[data-name]'))

      // Sort them to keep layout position consistent: local first, then alphabetically by name
      videos.sort((a, b) => {
        const isLocalA = a.getAttribute('data-is-local') === 'true'
        const isLocalB = b.getAttribute('data-is-local') === 'true'
        if (isLocalA && !isLocalB) return -1
        if (!isLocalA && isLocalB) return 1
        return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '')
      })

      const N = videos.length
      let cols = 1
      let rows = 1
      if (N > 1) {
        cols = Math.ceil(Math.sqrt(N))
        rows = Math.ceil(N / cols)
      }

      const tileWidth = Math.floor(1280 / cols)
      const tileHeight = Math.floor(720 / rows)

      // Draw background
      ctx.fillStyle = '#090d16' // dark slate
      ctx.fillRect(0, 0, 1280, 720)

      videos.forEach((videoElement, i) => {
        const colIndex = i % cols
        const rowIndex = Math.floor(i / cols)
        const x = colIndex * tileWidth
        const y = rowIndex * tileHeight
        const pName = videoElement.getAttribute('data-name') || 'User'
        const videoOn = videoElement.getAttribute('data-video-on') === 'true'

        // Draw background gradient for each tile
        const gradient = ctx.createLinearGradient(x, y, x + tileWidth, y + tileHeight)
        gradient.addColorStop(0, '#1e293b') // slate-800
        gradient.addColorStop(1, '#0f172a') // slate-900
        ctx.fillStyle = gradient
        ctx.fillRect(x, y, tileWidth, tileHeight)

        if (videoOn && videoElement.readyState >= 2) {
          // Draw video frame with object-cover style crop
          const sw = videoElement.videoWidth || 640
          const sh = videoElement.videoHeight || 480
          const sAspect = sw / sh
          const dAspect = tileWidth / tileHeight
          let sx, sy, sWidth, sHeight
          if (sAspect > dAspect) {
            sWidth = sh * dAspect
            sHeight = sh
            sx = (sw - sWidth) / 2
            sy = 0
          } else {
            sWidth = sw
            sHeight = sw / dAspect
            sx = 0
            sy = (sh - sHeight) / 2
          }
          ctx.drawImage(videoElement, sx, sy, sWidth, sHeight, x, y, tileWidth, tileHeight)
        } else {
          // Draw Avatar circle
          const cx = x + tileWidth / 2
          const cy = y + tileHeight / 2
          const radius = Math.min(tileWidth, tileHeight) * 0.18
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
          ctx.fillStyle = 'rgba(99, 102, 241, 0.2)' // Indigo accents
          ctx.fill()
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)'
          ctx.lineWidth = 2
          ctx.stroke()

          const initial = (pName ? pName[0] : 'U').toUpperCase()
          ctx.fillStyle = '#ffffff'
          ctx.font = `bold ${Math.floor(radius * 0.8)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(initial, cx, cy)
        }

        // Draw bottom name label pill
        const labelHeight = 24
        const labelY = y + tileHeight - labelHeight - 8
        const labelX = x + 8
        ctx.font = '12px sans-serif'
        const textWidth = ctx.measureText(pName).width
        const pillWidth = textWidth + 30

        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(labelX, labelY, pillWidth, labelHeight, 6)
        } else {
          ctx.rect(labelX, labelY, pillWidth, labelHeight)
        }
        ctx.fill()

        const audioOn = videoElement.getAttribute('data-audio-on') === 'true'
        ctx.fillStyle = audioOn ? '#10b981' : '#ef4444' // Emerald green / red
        ctx.beginPath()
        ctx.arc(labelX + 12, labelY + labelHeight / 2, 4, 0, 2 * Math.PI)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(pName, labelX + 22, labelY + labelHeight / 2)

        // Draw hand raised
        const handRaised = videoElement.getAttribute('data-hand-raised') === 'true'
        if (handRaised) {
          ctx.fillStyle = '#f59e0b' // amber-500
          ctx.beginPath()
          ctx.arc(x + tileWidth - 20, y + 20, 10, 0, 2 * Math.PI)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('✋', x + tileWidth - 20, y + 20)
        }
      })

      // 4. Dynamic Audio Mixing inside the render loop
      // Mix local audio stream tracks if they become available and aren't connected yet
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          if (track.readyState === 'live' && !connectedAudioTracksRef.current.has(track.id)) {
            try {
              const srcStream = new MediaStream([track])
              const sourceNode = audioCtx.createMediaStreamSource(srcStream)
              sourceNode.connect(audioDest)
              connectedAudioTracksRef.current.add(track.id)
              console.log(`[Recording] Dynamically mixed local audio track: ${track.id}`)
            } catch (err) {
              console.warn('Failed to mix local audio track:', err)
            }
          }
        })
      }

      // Mix remote peer audio tracks dynamically
      peersRef.current.forEach(peer => {
        if (peer.stream) {
          peer.stream.getAudioTracks().forEach(track => {
            if (track.readyState === 'live' && !connectedAudioTracksRef.current.has(track.id)) {
              try {
                const srcStream = new MediaStream([track])
                const sourceNode = audioCtx.createMediaStreamSource(srcStream)
                sourceNode.connect(audioDest)
                connectedAudioTracksRef.current.add(track.id)
                console.log(`[Recording] Dynamically mixed remote audio track: ${track.id} from peer ${peer.name}`)
              } catch (err) {
                console.warn('Failed to mix remote peer audio track:', err)
              }
            }
          })
        }
      })

      recordingRafRef.current = requestAnimationFrame(drawAndMixFrame)
    }

    // 4. Capture canvas stream (30 FPS)
    const canvasStream = canvas.captureStream(30)
    const videoTrack = canvasStream.getVideoTracks()[0]

    if (!videoTrack) {
      addToast('Failed to capture canvas video track.', 'error')
      setRecordingState('error')
      return
    }

    // 5. Combine canvas video track with mixed audio destination stream
    const mixedStreamTracks = [videoTrack]
    const audioTracks = audioDest.stream.getAudioTracks()
    if (audioTracks.length > 0) {
      mixedStreamTracks.push(audioTracks[0])
    }

    const recordingStream = new MediaStream(mixedStreamTracks)

    // 6. Set up MediaRecorder
    let mimeType = 'video/webm;codecs=vp9,opus'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus'
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }

    try {
      const recorder = new MediaRecorder(recordingStream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        // Clean up animation frame loop
        if (recordingRafRef.current) {
          cancelAnimationFrame(recordingRafRef.current)
          recordingRafRef.current = null
        }
        // Clean up audio context
        if (recordingAudioCtxRef.current) {
          recordingAudioCtxRef.current.close().catch(e => console.warn('Error closing AudioContext:', e))
          recordingAudioCtxRef.current = null
        }
        // Stop captured canvas stream tracks
        canvasStream.getTracks().forEach(t => t.stop())
        // Upload the recorded file
        await handleRecordingUpload()
      }

      // Start recording
      recorder.start(1000) // 1s chunks
      setRecordingState('recording')
      setRecordingDuration(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      // Start compositor loop
      recordingRafRef.current = requestAnimationFrame(drawAndMixFrame)

      addToast('Meeting recording started.', 'info')
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err)
      addToast('Failed to start recording: ' + err.message, 'error')
      setRecordingState('error')
      
      // Cleanup on failure
      if (recordingRafRef.current) {
        cancelAnimationFrame(recordingRafRef.current)
        recordingRafRef.current = null
      }
      if (recordingAudioCtxRef.current) {
        recordingAudioCtxRef.current.close().catch(e => {})
        recordingAudioCtxRef.current = null
      }
    }
  }

  // Stop recording meeting stream
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
      setRecordingState('uploading')
      addToast('Processing and uploading recording...', 'info')
    }
  }

  // Upload recording file to backend
  const handleRecordingUpload = async () => {
    const chunks = recordedChunksRef.current
    if (chunks.length === 0) {
      addToast('No recorded data available.', 'error')
      setRecordingState('idle')
      if (navigateAfterUploadRef.current) {
        cleanupConnections()
        navigate('/meetings')
      }
      return
    }

    const blob = new Blob(chunks, { type: mediaRecorderRef.current?.mimeType || 'video/webm' })
    const file = new File([blob], 'recording.webm', { type: blob.type })

    const formData = new FormData()
    formData.append('recording', file)

    try {
      const headers = {}
      if (user && user.token) {
        headers['Authorization'] = `Bearer ${user.token}`
      }

      const res = await fetch(`/api/meetings/${meeting?._id || id}/recording`, {
        method: 'POST',
        headers,
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        setRecordingState('processing')
        addToast('Recording uploaded! AI summary generation started in the background.', 'success')
      } else {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || 'Upload failed')
      }
    } catch (err) {
      console.error('Failed to upload recording:', err)
      addToast('Recording upload failed: ' + err.message, 'error')
      setRecordingState('error')
      setTimeout(() => setRecordingState('idle'), 3000)
    } finally {
      if (navigateAfterUploadRef.current) {
        cleanupConnections()
        navigate('/meetings')
      }
    }
  }

  // Format recording duration (seconds -> HH:MM:SS)
  const formatTime = (secs) => {
    const hours = Math.floor(secs / 3600)
    const minutes = Math.floor((secs % 3600) / 60)
    const seconds = secs % 60
    
    const pad = (num) => String(num).padStart(2, '0')
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    }
    return `${pad(minutes)}:${pad(seconds)}`
  }

  useEffect(() => {
    if (meeting && meeting.status === 'completed') {
      fetch('/api/workspaces')
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setWorkspaces(data);
          if (data.length > 0) setSelectedWorkspaceId(data[0]._id);
        })
        .catch(err => console.error("Error loading workspaces for completed meeting sync:", err));

      setCompletedLogsLoading(true);
      fetch(`/api/meeting-chat/${meeting.roomId}/messages`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setCompletedLogs(data);
          setCompletedLogsLoading(false);
        })
        .catch(err => {
          console.error("Error loading transcripts:", err);
          setCompletedLogsLoading(false);
        });
    }
  }, [meeting]);

  const handleTriggerAI = async () => {
    if (!meeting) return;
    setAiProcessing(true);
    try {
      const updated = await processMeetingAI(meeting._id);
      if (updated) {
        setMeeting(updated);
        addToast("AI Analysis completed successfully!", "success");
      } else {
        addToast("AI Analysis failed. Make sure GROQ_API_KEY is configured.", "error");
      }
    } catch (err) {
      console.error("Error running AI processing:", err);
      addToast("Failed to process meeting AI.", "error");
    } finally {
      setAiProcessing(false);
    }
  };

  const handleSummarizeChats = async () => {
    if (!meeting) return;
    setSummarizingChats(true);
    try {
      const res = await fetch(`/api/meetings/${meeting._id}/summarize-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setChatSummary(data.summary);
        addToast("Chat summary generated!", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || "Failed to summarize chats.", "error");
      }
    } catch (err) {
      console.error("Error summarizing chats:", err);
      addToast("Failed to summarize chats.", "error");
    } finally {
      setSummarizingChats(false);
    }
  };

  const handleAddToKanban = async (taskText, priority, index) => {
    if (!selectedWorkspaceId) {
      addToast("Please select a workspace first.", "info");
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspaceId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskText,
          description: `AI Extracted action item from meeting: "${meeting.title}"`,
          priority: priority,
          status: 'todo'
        })
      });

      if (res.ok) {
        setSyncStatus(prev => ({ ...prev, [index]: true }));
        addToast("Task successfully synced to Kanban board!", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || "Failed to sync task.", "error");
      }
    } catch (err) {
      console.error("Error syncing task to Kanban:", err);
      addToast("Failed to sync task.", "error");
    }
  };

  const renderMarkdown = (text) => {
    if (!text) return <p className="text-xs text-muted-foreground italic">No summary generated yet.</p>;
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-xs uppercase tracking-wider font-extrabold mt-4 mb-2 text-foreground flex items-center gap-1.5">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-sm font-display font-extrabold mt-5 mb-2 border-b border-border/60 pb-1.5 text-foreground">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-base font-display font-extrabold mt-6 mb-3 text-foreground">$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-xs text-muted-foreground leading-relaxed my-1.5">$1</li>');
    html = html.replace(/\n/g, '<br />');
    
    return <div className="space-y-1 text-xs text-muted-foreground leading-relaxed select-text" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const sendChatMessage = (e) => {
    if (e) e.preventDefault()
    if (!chatInput.trim() || !socketRef.current || !meeting) return
    socketRef.current.emit('meeting_send_message', {
      roomId: meeting.roomId,
      senderId: user.id,
      senderName: user.name,
      text: chatInput.trim()
    })
    setChatInput('')
    socketRef.current.emit('meeting_stop_typing', {
      roomId: meeting.roomId,
      userId: user.id
    })
  }

  const handleTyping = (e) => {
    setChatInput(e.target.value)
    if (!socketRef.current || !meeting) return
    socketRef.current.emit('meeting_typing', {
      roomId: meeting.roomId,
      userId: user.id,
      userName: user.name
    })
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit('meeting_stop_typing', {
        roomId: meeting.roomId,
        userId: user.id
      })
    }, 2000)
  }

  const toggleHandRaise = () => {
    if (!socketRef.current || !meeting) return
    const nextState = !myHandRaised
    setMyHandRaised(nextState)
    if (nextState) {
      socketRef.current.emit('meeting_raise_hand', {
        roomId: meeting.roomId,
        userId: user.id,
        userName: user.name
      })
      setRaisedHands(prev => {
        const next = new Set(prev)
        next.add(user.id)
        return next
      })
    } else {
      socketRef.current.emit('meeting_lower_hand', {
        roomId: meeting.roomId,
        userId: user.id,
        userName: user.name
      })
      setRaisedHands(prev => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
    }
  }

  const handleNotesChange = (e) => {
    const val = e.target.value
    setSharedNotes(val)
    setNotesSaveStatus('saving')
    if (!socketRef.current || !meeting) return
    if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current)
    notesTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit('meeting_update_notes', {
        roomId: meeting.roomId,
        content: val,
        senderId: user.id
      })
      setNotesSaveStatus('saved')
    }, 500)
  }

  const sendReaction = (emoji) => {
    if (!socketRef.current || !meeting) return
    socketRef.current.emit('meeting_reaction', {
      roomId: meeting.roomId,
      emoji,
      senderName: user.name
    })
  }

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current)
      if (localTranscriptTimeoutRef.current) clearTimeout(localTranscriptTimeoutRef.current)
      peerTranscriptTimeoutsRef.current.forEach(t => clearTimeout(t))
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
  }, [])

  // Auto-hide local transcript
  useEffect(() => {
    if (localTranscript) {
      if (localTranscriptTimeoutRef.current) clearTimeout(localTranscriptTimeoutRef.current);
      localTranscriptTimeoutRef.current = setTimeout(() => {
        setLocalTranscript("");
      }, 4000);
    }
  }, [localTranscript]);

  // Client-side Web Speech Recognition
  useEffect(() => {
    if (!joined || !mic || !meeting || !socketRef.current || !aiTranscribe) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        const transcriptText = result[0].transcript.trim();
        if (transcriptText && socketRef.current) {
          socketRef.current.emit('meeting_transcription_segment', {
            roomId: meeting.roomId,
            senderId: user.id,
            senderName: user.name,
            text: transcriptText
          });
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
      // Automatically restart if mic is active and joined is true and AI transcription is enabled
      if (joined && mic && aiTranscribe) {
        try {
          recognition.start();
        } catch (e) {
          console.warn("Speech recognition restart failed:", e);
        }
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
    }

    return () => {
      recognition.onend = null;
      try {
        recognition.stop();
      } catch (e) {
        // Safe ignore
      }
    };
  }, [joined, mic, meeting, aiTranscribe]);

  useEffect(() => {
    if (tab === 'chat') {
      setUnreadChat(0)
    }
  }, [tab])

  // Status and Schedule Flags
  const meetingDateTime = meeting ? parseISO(`${meeting.date}T${meeting.time}`) : null
  const isFuture = meetingDateTime ? meetingDateTime > new Date() : false
  const isHost = meeting ? (meeting.host?._id === user?.id || meeting.host === user?.id) : false
  const isCompleted = meeting ? meeting.status === 'completed' : false
  const isOngoing = meeting ? meeting.status === 'ongoing' : false

  // Can the user join?
  const canJoin = !isCompleted && (!isFuture || isHost || isOngoing)

  // Fetch Meeting Details from database
  useEffect(() => {
    const loadDetails = async () => {
      try {
        const details = await fetchMeetingDetails(id)
        if (details && details.error) {
          setMeetingError(details)
        } else {
          setMeeting(details)
          // If the URL matches the Mongo _id, replace it with the clean roomId
          if (details.roomId && id === details._id) {
            navigate(`/meeting/${details.roomId}`, { replace: true })
          }
        }
      } catch (err) {
        console.error('Error fetching meeting details:', err)
      } finally {
        setLoadingMeeting(false)
      }
    }
    loadDetails()
  }, [id, fetchMeetingDetails, navigate])

  // Track User Status sync (in-meeting vs online)
  useEffect(() => {
    if (joined) {
      updateStatus?.('in-meeting')
    } else {
      updateStatus?.('online')
    }
    return () => {
      updateStatus?.('online')
    }
  }, [joined, updateStatus])

  // Call duration counter
  useEffect(() => {
    if (!joined) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [joined])

  // ------------------ PRE-JOIN LOBBY TRACKS ------------------

  // Enumerate hardware devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Prompt initial permission grant and clean up the stream immediately
        const permStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        permStream.getTracks().forEach(t => t.stop())
        
        const devices = await navigator.mediaDevices.enumerateDevices()
        const video = devices.filter(d => d.kind === 'videoinput')
        const audio = devices.filter(d => d.kind === 'audioinput')
        setVideoDevices(video)
        setAudioDevices(audio)
        
        if (video.length && !selectedVideo) setSelectedVideo(video[0].deviceId)
        if (audio.length && !selectedAudio) setSelectedAudio(audio[0].deviceId)
      } catch (err) {
        console.error('Error enumerating hardware devices:', err)
      }
    }
    if (!joined) {
      getDevices()
    }
  }, [joined])

  // Create stream constraints based on selections
  const initLocalStream = async (vDeviceId, aDeviceId) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
    }
    
    try {
      // Always capture audio — needed for reliable WebRTC replaceTrack muting without renegotiation.
      // Only capture video when cam=true so we don't turn on the camera LED unnecessarily.
      // When cam=false in lobby, toggleCam will dynamically acquire the camera on first enable.
      const constraints = {
        video: cam ? (vDeviceId ? { deviceId: { exact: vDeviceId } } : true) : false,
        audio: aDeviceId ? { deviceId: { exact: aDeviceId } } : true
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setLocalStream(stream)
      
      // Sync track enabled values to match lobby selection immediately
      stream.getVideoTracks().forEach(t => t.enabled = cam)
      stream.getAudioTracks().forEach(t => t.enabled = mic)
    } catch (err) {
      console.warn('Initial media grab failed, attempting fallback combinations:', err)
      // Fallback 1: Try audio-only if camera is blocked/missing
      try {
        const audioConstraints = {
          video: false,
          audio: aDeviceId ? { deviceId: { exact: aDeviceId } } : true
        }
        const audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints)
        setLocalStream(audioStream)
        audioStream.getAudioTracks().forEach(t => t.enabled = mic)
        setCam(false) // Set camera state to off since it's unavailable
      } catch (audioErr) {
        // Fallback 2: Try video-only if microphone is blocked/missing
        try {
          const videoConstraints = {
            video: vDeviceId ? { deviceId: { exact: vDeviceId } } : true,
            audio: false
          }
          const videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints)
          setLocalStream(videoStream)
          videoStream.getVideoTracks().forEach(t => t.enabled = cam)
          setMic(false) // Set mic state to off since it's unavailable
        } catch (videoErr) {
          console.error('All media acquisition combinations failed:', videoErr)
        }
      }
    }
  }

  // Refresh stream whenever inputs or camera/mic settings toggle
  useEffect(() => {
    if (!joined && (selectedVideo || selectedAudio || cam || mic)) {
      initLocalStream(selectedVideo, selectedAudio)
    }
    // eslint-disable-next-line
  }, [selectedVideo, selectedAudio, cam, mic, joined])

  // Render microphone volume level indicator in real-time using Audio API
  useEffect(() => {
    if (!localStream || !mic) {
      setMicLevel(0)
      return
    }
    
    let audioContext, analyzer, microphone, javascriptNode
    try {
      const audioTracks = localStream.getAudioTracks()
      if (audioTracks.length === 0) return
      
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      analyzer = audioContext.createAnalyser()
      microphone = audioContext.createMediaStreamSource(localStream)
      javascriptNode = audioContext.createScriptProcessor(2048, 1, 1)
      
      analyzer.smoothingTimeConstant = 0.8
      analyzer.fftSize = 1024
      
      microphone.connect(analyzer)
      analyzer.connect(javascriptNode)
      javascriptNode.connect(audioContext.destination)
      
      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyzer.frequencyBinCount)
        analyzer.getByteFrequencyData(array)
        let values = 0
        const length = array.length
        for (let i = 0; i < length; i++) {
          values += array[i]
        }
        const average = values / length
        // Scale to a percentage
        setMicLevel(Math.min(100, Math.round(average * 1.6)))
      }
    } catch (e) {
      console.error('Web Audio analyzer failure:', e)
    }
    
    return () => {
      if (javascriptNode) javascriptNode.disconnect()
      if (microphone) microphone.disconnect()
      if (analyzer) analyzer.disconnect()
      if (audioContext) audioContext.close()
    }
  }, [localStream, mic])


  // ------------------ WEBRTC SIGNALING SYSTEM ------------------

  const createPeerConnection = (peerSocketId, peerName, peerUserId) => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    }
    
    const pc = new RTCPeerConnection(configuration)
    peerConnectionsRef.current.set(peerSocketId, pc)
    
    // Bind local tracks or configure transceivers for audio and video
    const stream = localStreamRef.current
    const hasAudio = stream && stream.getAudioTracks().length > 0
    const hasVideo = stream && stream.getVideoTracks().length > 0

    // Configure Audio track / transceiver
    if (hasAudio) {
      stream.getAudioTracks().forEach(track => {
        const sender = pc.addTrack(track, stream)
        // Apply initial mute AFTER SDP negotiation completes (signalingState === 'stable').
        // Doing it via a microtask before createOffer() would cause the offer direction to
        // become 'recvonly'/'inactive', permanently breaking the ability to unmute without
        // a full renegotiation. Waiting for 'stable' keeps the SDP as 'sendrecv' throughout.
        if (!mic && sender) {
          let muteApplied = false
          const applyInitialMute = () => {
            if (pc.signalingState === 'stable' && !muteApplied) {
              muteApplied = true
              sender.replaceTrack(null).catch(e =>
                console.warn(`Initial audio null-replace for peer ${peerName}:`, e)
              )
              pc.removeEventListener('signalingstatechange', applyInitialMute)
            }
          }
          pc.addEventListener('signalingstatechange', applyInitialMute)
        }
      })
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' })
        console.log(`Configured recvonly audio transceiver for ${peerName}`)
      } catch (e) {
        console.warn('Failed to add audio receive-only transceiver:', e)
      }
    }

    // Configure Video track / transceiver
    if (hasVideo) {
      stream.getVideoTracks().forEach(track => {
        pc.addTrack(track, stream)
      })
    } else {
      try {
        pc.addTransceiver('video', { direction: 'recvonly' })
        console.log(`Configured recvonly video transceiver for ${peerName}`)
      } catch (e) {
        console.warn('Failed to add video receive-only transceiver:', e)
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        console.log(`Negotiation needed with peer ${peerName}`)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (socketRef.current) {
          socketRef.current.emit('send_offer', {
            targetSocketId: peerSocketId,
            offer,
            senderName: user.name,
            senderId: user.id
          })
        }
      } catch (err) {
        console.error('Error during renegotiation:', err)
      }
    }
    
    // Relay dynamic ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('send_ice_candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate
        })
      }
    }
    
    // Bind remote tracks to the layout grid safely across all browsers
    pc.ontrack = (event) => {
      console.log(`Track received from peer ${peerName}:`, event.track)
      setPeers(prev => prev.map(p => {
        if (p.socketId === peerSocketId) {
          const existingStream = p.stream || new MediaStream()
          if (!existingStream.getTracks().find(t => t.id === event.track.id)) {
            existingStream.addTrack(event.track)
          }
          // Clone the stream to a new reference to trigger React's dependency checks
          const newStream = new MediaStream(existingStream.getTracks())
          return { ...p, stream: newStream }
        }
        return p
      }))
    }
    
    pc.onconnectionstatechange = () => {
      console.log(`Peer state with ${peerName}: ${pc.connectionState}`)
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setPeers(prev => prev.filter(p => p.socketId !== peerSocketId))
      }
    }
    
    return pc
  }

  const handleJoin = async () => {
    if (meeting && meeting.status === 'upcoming') {
      try {
        await updateMeetingStatus(meeting._id, 'ongoing')
      } catch (err) {
        console.error('Failed to update meeting status to ongoing:', err)
      }
    }
    setJoined(true)
  }

  // Setup WebRTC and Sockets connection once joining call room
  useEffect(() => {
    if (!joined || !meeting) return

    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
      withCredentials: true
    })
    socketRef.current = socket

    const loadChatHistory = async () => {
      try {
        const res = await fetch('/api/meeting-chat/' + meeting.roomId + '/messages')
        if (res.ok) {
          const data = await res.json()
          const filteredData = data.filter(m => m.type !== 'transcript')
          setChatMessages(filteredData)
          const hist = data
            .filter(m => m.type === 'system')
            .map(m => ({
              id: m._id,
              text: m.text,
              type: 'system',
              time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }))
          setActivityFeed(hist)
        }
      } catch (err) {
        console.error('Error fetching chat history:', err)
      }
    }
    loadChatHistory()

    socket.on('meeting_receive_message', (message) => {
      setChatMessages(prev => [...prev, message])
      if (tab !== 'chat') {
        setUnreadChat(c => c + 1)
      }
      if (message.type === 'system') {
        addToast(message.text, 'system')
      }
    })

    socket.on('meeting_user_typing', ({ userId, userName }) => {
      setTypingUsers(prev => {
        if (prev.some(u => u.userId === userId)) return prev
        return [...prev, { userId, userName }]
      })
    })

    socket.on('meeting_user_stop_typing', ({ userId }) => {
      setTypingUsers(prev => prev.filter(u => u.userId !== userId))
    })

    socket.on('meeting_reaction_received', ({ emoji, senderName, id }) => {
      setFloatingReactions(prev => [...prev, { id, emoji, senderName }])
      addToast(senderName + ' reacted ' + emoji, 'reaction')
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id))
      }, 3000)
    })

    socket.on('meeting_hand_raised', ({ userId, userName }) => {
      setRaisedHands(prev => {
        const next = new Set(prev)
        next.add(userId)
        return next
      })
      addToast(userName + ' raised hand 🤚', 'hand')
    })

    socket.on('meeting_hand_lowered', ({ userId }) => {
      setRaisedHands(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    })

    socket.on('meeting_notes_synced', ({ content }) => {
      setSharedNotes(content)
      setNotesSaveStatus('saved')
    })

    socket.on('meeting_ai_ready', (data) => {
      setMeeting(prev => prev ? { 
        ...prev, 
        summary: data.summary, 
        actionItems: data.actionItems, 
        recordingUrl: data.recordingUrl || prev.recordingUrl,
        aiProcessed: true 
      } : prev)
      setRecordingState('idle')
      addToast('AI Summary & Playback are ready!', 'success')
    })

    socket.on('meeting_ai_error', (data) => {
      setRecordingState('error')
      addToast(`AI Processing error: ${data.message}`, 'error')
      setTimeout(() => setRecordingState('idle'), 4000)
    })

    // Emit connection event
    socket.emit('join_meeting', {
      roomId: meeting.roomId,
      userId: user.id,
      name: user.name,
      mic,
      cam
    })

    // Establish WebRTC SDP calls with existing participants
    socket.on('room_participants', async (participants) => {
      console.log('Room participants loaded:', participants)
      const list = []
      
      for (const p of participants) {
        const { socketId, userId, name, mic: pMic, cam: pCam } = p
        const pc = createPeerConnection(socketId, name, userId)
        
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('send_offer', {
            targetSocketId: socketId,
            offer,
            senderName: user.name,
            senderId: user.id
          })
        } catch (e) {
          console.error(`Offer failed for ${socketId}:`, e)
        }
        
        list.push({
          socketId,
          userId,
          name,
          mic: pMic,
          cam: pCam,
          stream: null
        })
      }
      setPeers(list)
    })

    // SDP offer handling (set description and answer back)
    socket.on('receive_offer', async ({ senderSocketId, offer, senderName, senderId }) => {
      console.log('SDP Offer received from:', senderSocketId)
      let pc = peerConnectionsRef.current.get(senderSocketId)
      if (!pc) {
        pc = createPeerConnection(senderSocketId, senderName, senderId)
      }
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        socket.emit('send_answer', {
          targetSocketId: senderSocketId,
          answer
        })

        setPeers(prev => {
          if (prev.some(p => p.socketId === senderSocketId)) return prev
          return [...prev, {
            socketId: senderSocketId,
            userId: senderId,
            name: senderName,
            mic: true,
            cam: true,
            stream: null
          }]
        })
      } catch (err) {
        console.error('Error handling SDP offer:', err)
      }
    })

    // SDP answer handling
    socket.on('receive_answer', async ({ senderSocketId, answer }) => {
      console.log('SDP Answer received from:', senderSocketId)
      const pc = peerConnectionsRef.current.get(senderSocketId)
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
        } catch (err) {
          console.error('Error setting remote answer:', err)
        }
      }
    })

    // ICE Candidate routing
    socket.on('receive_ice_candidate', async ({ senderSocketId, candidate }) => {
      const pc = peerConnectionsRef.current.get(senderSocketId)
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('Error attaching remote ICE candidate:', err)
        }
      }
    })

    // Peer Joined signaling
    socket.on('peer_joined', ({ socketId, userId, name, mic: pMic, cam: pCam }) => {
      console.log(`Peer entered the call: ${name}`)
      setPeers(prev => {
        if (prev.some(p => p.socketId === socketId)) {
          return prev.map(p => p.socketId === socketId ? { ...p, name, userId, mic: pMic, cam: pCam } : p)
        }
        return [...prev, {
          socketId,
          userId,
          name,
          mic: pMic,
          cam: pCam,
          stream: null
        }]
      })
    })

    // Peer Left signaling
    socket.on('peer_left', ({ socketId }) => {
      console.log('Peer disconnected from room:', socketId)
      const pc = peerConnectionsRef.current.get(socketId)
      if (pc) {
        pc.close()
        peerConnectionsRef.current.delete(socketId)
      }
      setPeers(prev => prev.filter(p => p.socketId !== socketId))
      setPinnedPeer(prev => (prev && prev.socketId === socketId) ? null : prev)
    })

    // Peer Media state update
    socket.on('peer_media_toggled', ({ socketId, type, enabled }) => {
      setPeers(prev => prev.map(p => {
        if (p.socketId === socketId) {
          return { ...p, [type === 'audio' ? 'mic' : 'cam']: enabled }
        }
        return p
      }))
    })

    return () => {
      cleanupConnections()
    }
    // eslint-disable-next-line
  }, [joined, meeting])

  // Track termination cleanup
  const cleanupConnections = () => {
    console.log('Dismantling WebRTC media connections...')
    
    // Stop recording loops and audio context
    if (recordingRafRef.current) {
      cancelAnimationFrame(recordingRafRef.current)
      recordingRafRef.current = null
    }
    if (recordingAudioCtxRef.current) {
      recordingAudioCtxRef.current.close().catch(e => {})
      recordingAudioCtxRef.current = null
    }

    if (socketRef.current) {
      socketRef.current.emit('leave_meeting', { roomId: meeting?.roomId || id })
      socketRef.current.disconnect()
      socketRef.current = null
    }
    
    peerConnectionsRef.current.forEach(pc => pc.close())
    peerConnectionsRef.current.clear()
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
    }
    setLocalStream(null)
    setPeers([])
    setScreen(false)
    setPinnedPeer(null)
  }

  // ------------------ TRACK CONTROLS ------------------

  // Helper to update video track across all active RTCPeerConnections
  const updateVideoTrackOnPeers = async (videoTrack) => {
    for (const [socketId, pc] of peerConnectionsRef.current.entries()) {
      try {
        const transceivers = pc.getTransceivers()
        const videoTransceiver = transceivers.find(t => 
          (t.sender && t.sender.track && t.sender.track.kind === 'video') ||
          (t.receiver && t.receiver.track && t.receiver.track.kind === 'video') ||
          t.mid === 'video' ||
          (t.sender && !t.sender.track && t.receiver && t.receiver.track && t.receiver.track.kind === 'video')
        )
        
        if (videoTransceiver) {
          if (videoTrack) {
            await videoTransceiver.sender.replaceTrack(videoTrack)
            videoTransceiver.direction = 'sendrecv'
            console.log(`Replaced video track for peer ${socketId} and set direction to sendrecv`)
          } else {
            await videoTransceiver.sender.replaceTrack(null)
            videoTransceiver.direction = 'recvonly'
            console.log(`Removed video track for peer ${socketId} and set direction to recvonly`)
          }
        } else if (videoTrack) {
          pc.addTrack(videoTrack, localStreamRef.current)
          console.log(`Added video track to new transceiver/sender for peer ${socketId}`)
        }
      } catch (e) {
        console.error(`Error updating video track for peer ${socketId}:`, e)
      }
    }
  }

  // Helper to update audio track across all active RTCPeerConnections
  const updateAudioTrackOnPeers = async (audioTrack) => {
    for (const [socketId, pc] of peerConnectionsRef.current.entries()) {
      try {
        const transceivers = pc.getTransceivers()
        const audioTransceiver = transceivers.find(t => 
          (t.sender && t.sender.track && t.sender.track.kind === 'audio') ||
          (t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') ||
          t.mid === 'audio' ||
          (t.sender && !t.sender.track && t.receiver && t.receiver.track && t.receiver.track.kind === 'audio')
        )
        
        if (audioTransceiver) {
          if (audioTrack) {
            await audioTransceiver.sender.replaceTrack(audioTrack)
            audioTransceiver.direction = 'sendrecv'
            console.log(`Replaced audio track for peer ${socketId} and set direction to sendrecv`)
          } else {
            await audioTransceiver.sender.replaceTrack(null)
            audioTransceiver.direction = 'recvonly'
            console.log(`Removed audio track for peer ${socketId} and set direction to recvonly`)
          }
        } else if (audioTrack) {
          pc.addTrack(audioTrack, localStreamRef.current)
          console.log(`Added audio track to new transceiver/sender for peer ${socketId}`)
        }
      } catch (e) {
        console.error(`Error updating audio track for peer ${socketId}:`, e)
      }
    }
  }

  const toggleMic = async () => {
    const nextMic = !mic
    setMic(nextMic)
    
    if (localStream) {
      const audioTracks = localStream.getAudioTracks()
      audioTracks.forEach(t => t.enabled = nextMic)
      // Use the robust helper that handles all transceiver edge-cases
      // (sender null from initial mute, direction resets, dynamic addTrack fallback)
      await updateAudioTrackOnPeers(nextMic ? (audioTracks[0] || null) : null)
    }
    if (socketRef.current) {
      socketRef.current.emit('toggle_media', {
        roomId: meeting?.roomId || id,
        type: 'audio',
        enabled: nextMic
      })
    }
  }

  const toggleCam = async () => {
    const nextCam = !cam
    setCam(nextCam)
    
    if (localStream) {
      const videoTracks = localStream.getVideoTracks()
      const liveVideoTracks = videoTracks.filter(t => t.readyState === 'live')
      
      if (liveVideoTracks.length > 0) {
        // Camera track already in stream — just enable/disable it
        liveVideoTracks.forEach(t => t.enabled = nextCam)
        await updateVideoTrackOnPeers(nextCam ? liveVideoTracks[0] : null)
      } else if (nextCam) {
        // No live video track (camera was never captured or was stopped).
        // Acquire camera dynamically and add it to the peer connections.
        try {
          const constraints = {
            video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
            audio: false
          }
          const camStream = await navigator.mediaDevices.getUserMedia(constraints)
          const camTrack = camStream.getVideoTracks()[0]
          camTrack.enabled = true
          await updateVideoTrackOnPeers(camTrack)
          // Merge the new camera track into a combined stream
          const combined = new MediaStream([
            camTrack,
            ...localStream.getAudioTracks()
          ])
          setLocalStream(combined)
        } catch (err) {
          console.error('Failed to acquire camera for toggleCam:', err)
          setCam(false) // Revert if camera unavailable
        }
      }
    }
    if (socketRef.current) {
      socketRef.current.emit('toggle_media', {
        roomId: meeting?.roomId || id,
        type: 'video',
        enabled: nextCam
      })
    }
  }

  // Handle screen share toggling
  const toggleScreenShare = async () => {
    if (!screen) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        const screenTrack = screenStream.getVideoTracks()[0]
        
        screenTrack.onended = () => {
          stopScreenShare()
        }
        
        await updateVideoTrackOnPeers(screenTrack)
        
        localVideoTrackRef.current = localStream ? localStream.getVideoTracks()[0] : null
        
        const combined = new MediaStream([screenTrack, ...(localStream ? localStream.getAudioTracks() : [])])
        setLocalStream(combined)
        setScreen(true)

        if (socketRef.current) {
          socketRef.current.emit('toggle_media', {
            roomId: meeting?.roomId || id,
            type: 'video',
            enabled: true
          })
        }
      } catch (err) {
        console.error('Error initiating screen sharing:', err)
      }
    } else {
      stopScreenShare()
    }
  }

  const stopScreenShare = async () => {
    if (!screen) return
    try {
      const screenTrack = localStream ? localStream.getVideoTracks()[0] : null
      if (screenTrack) screenTrack.stop()
      
      let camTrack = null
      if (cam) {
        try {
          const constraints = {
            video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
            audio: false
          }
          const camStream = await navigator.mediaDevices.getUserMedia(constraints)
          camTrack = camStream.getVideoTracks()[0]
          camTrack.enabled = cam
        } catch (e) {
          console.warn('Failed to recover camera track after screen share:', e)
        }
      }
      
      await updateVideoTrackOnPeers(camTrack)
      
      const nextTracks = camTrack ? [camTrack, ...(localStream ? localStream.getAudioTracks() : [])] : [...(localStream ? localStream.getAudioTracks() : [])]
      const combined = new MediaStream(nextTracks)
      setLocalStream(combined)
      setScreen(false)

      if (socketRef.current) {
        socketRef.current.emit('toggle_media', {
          roomId: meeting?.roomId || id,
          type: 'video',
          enabled: cam
        })
      }
    } catch (err) {
      console.error('Error recovering camera track:', err)
      setScreen(false)
    }
  }

  const copyLink = () => {
    const inviteLink = `${window.location.origin}/meeting/${meeting?.roomId || id}`
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLeave = async () => {
    if (recordingState === 'recording') {
      addToast('Saving meeting recording. Please wait...', 'info')
      navigateAfterUploadRef.current = true
      stopRecording()
    } else {
      cleanupConnections()
      navigate('/meetings')
    }
  }


  // ------------------ LAYOUT DESIGN ------------------

  if (loadingMeeting) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-3 animate-fade-in">
        <svg className="animate-spin h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-muted-foreground text-sm font-medium">Entering meeting room details…</p>
      </div>
    )
  }

  if (meetingError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 bg-background">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 text-destructive mb-2 mx-auto shadow-inner">
          <Lock size={28} />
        </div>
        <h2 className="font-display font-bold text-xl text-foreground">Access Denied</h2>
        <p className="text-muted-foreground text-xs max-w-sm mx-auto leading-relaxed">
          {meetingError.message || 'This meeting room is private. You are not authorized to join.'}
        </p>
        <Link to="/meetings">
          <Button variant="outline" size="sm" className="gap-2 font-semibold mt-2 shadow-sm">
            <ArrowLeft size={14} /> Back to Meetings
          </Button>
        </Link>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-muted-foreground text-base">Invalid room code or meeting not found.</p>
        <Link to="/meetings">
          <Button variant="outline" size="sm" className="mt-4 gap-2">
            <ArrowLeft size={14} /> Back to Dashboard
          </Button>
        </Link>
      </div>
    )
  }

  if (isCompleted) {
    const formattedDuration = meeting.duration 
      ? `${Math.floor(meeting.duration / 60)}m ${meeting.duration % 60}s` 
      : 'N/A';

    return (
      <div className="min-h-screen bg-background flex flex-col animate-fade-in p-6 sm:p-8 space-y-6 select-none overflow-y-auto">
        
        {/* Hidden Print Container for PDF Export */}
        <div className="hidden print:block p-8 space-y-6 text-black bg-white select-text">
          <div className="border-b-2 border-slate-300 pb-4">
            <h1 className="text-2xl font-bold font-display">MeetFlow AI Meeting Report</h1>
            <p className="text-sm text-slate-500 mt-1">Generated automatically on {new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-xs pt-2">
            <p><strong>Meeting Title:</strong> {meeting.title}</p>
            <p><strong>Host:</strong> {meeting.host?.name || 'Unknown'}</p>
            <p><strong>Scheduled Time:</strong> {meeting.date} at {meeting.time}</p>
            <p><strong>Duration:</strong> {formattedDuration}</p>
          </div>

          <div className="border-t border-slate-200 mt-6 pt-4">
            <h2 className="text-sm uppercase tracking-wider font-extrabold text-slate-700">AI Meeting Summary</h2>
            <div className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
              {meeting.summary || "No AI summary has been processed for this meeting."}
            </div>
          </div>

          <div className="border-t border-slate-200 mt-6 pt-4">
            <h2 className="text-sm uppercase tracking-wider font-extrabold text-slate-700">Action Items</h2>
            {meeting.actionItems && meeting.actionItems.length > 0 ? (
              <ul className="list-disc pl-5 mt-2 space-y-2 text-xs text-slate-600">
                {meeting.actionItems.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">
                    <strong>[{item.priority.toUpperCase()}]</strong> {item.task} {item.assigneeName ? `(Assignee: ${item.assigneeName})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 italic mt-2">No action items were extracted.</p>
            )}
          </div>

          <div className="border-t border-slate-200 mt-6 pt-4">
            <h2 className="text-sm uppercase tracking-wider font-extrabold text-slate-700">Meeting Notes</h2>
            <div className="mt-2 text-xs text-slate-600 whitespace-pre-line font-mono bg-slate-50 p-3 rounded border">
              {meeting.notes || "No shared notes captured."}
            </div>
          </div>
        </div>

        {/* Regular Interactive Screen (no-print) */}
        <div className="max-w-6xl w-full mx-auto space-y-6 print:hidden">
          
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-card to-card/65 border border-border/40 rounded-2xl p-6 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => navigate('/meetings')}>
                <ArrowLeft size={18} />
              </Button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="font-display font-extrabold text-xl tracking-tight text-foreground">{meeting.title}</h1>
                  <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">Completed</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1"><CalendarDays size={12} className="text-primary" />{meeting.date}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock size={12} className="text-primary" />{meeting.time}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock size={12} className="text-emerald-500" />{formattedDuration}</span>
                </p>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" className="gap-2 font-semibold text-xs flex-1 sm:flex-initial" onClick={() => window.print()}>
                <FileText size={14} className="text-primary" /> Export PDF
              </Button>
              <Button variant="default" size="sm" className="font-semibold text-xs flex-1 sm:flex-initial" onClick={() => navigate('/meetings')}>
                Back to List
              </Button>
            </div>
          </div>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Content Area (Tabs + Panels) */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              
              {/* Tab Navigation triggers */}
              <div className="flex bg-card/65 border border-border/40 p-1 rounded-xl shadow-sm backdrop-blur-sm shrink-0 overflow-x-auto">
                {[
                  { id: 'overview', label: 'Notes & Agenda', icon: FileText },
                  { id: 'ai', label: 'AI Summary', icon: Smile },
                  { id: 'actionItems', label: 'Action Items', icon: Hand },
                  { id: 'transcript', label: 'Transcript', icon: MessageSquare },
                  ...(meeting.recordingUrl && (!meeting.recordedBy || (user && (meeting.recordedBy === user.id || meeting.recordedBy === user._id || meeting.recordedBy?._id === user.id || meeting.recordedBy?._id === user._id))) ? [{ id: 'recording', label: 'Play Recording', icon: Video }] : [])
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setCompletedTab(t.id)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-display font-bold flex items-center justify-center gap-1.5 transition-all ${
                        completedTab === t.id
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/45'
                      }`}
                    >
                      <Icon size={14} />
                      <span className="hidden sm:inline">{t.label}</span>
                    </button>
                  );
                })}
              </div>


              {/* Tab Content Panel */}
              <div className="flex-1 min-h-[400px] bg-card/85 border border-border/40 rounded-2xl p-6 shadow-md backdrop-blur-md flex flex-col">
                
                {/* 1. Overview Tab */}
                {completedTab === 'overview' && (
                  <div className="space-y-6 flex-1 flex flex-col">
                    <div>
                      <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
                        <Info size={13} className="text-primary" /> Agenda / Description
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-secondary/25 border border-border/30 rounded-xl p-3.5 select-text">
                        {meeting.description || 'No agenda was set for this meeting.'}
                      </p>
                    </div>

                    <div className="border-t border-border/40 pt-5 flex-1 flex flex-col">
                      <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
                        <FileText size={13} className="text-primary" /> Shared Meeting Notes
                      </h3>
                      <textarea
                        readOnly
                        value={meeting.notes || ''}
                        placeholder="No shared notes were written during this session."
                        className="flex-1 w-full text-xs font-semibold bg-secondary/15 border border-border/30 rounded-xl p-4 text-foreground leading-relaxed font-body focus:outline-none resize-none min-h-[250px] select-text"
                      />
                    </div>
                  </div>
                )}

                {/* 2. AI Summary Tab */}
                {completedTab === 'ai' && (
                  <div className="space-y-5 flex-1 flex flex-col justify-center">
                    {!meeting.aiProcessed ? (
                      <div className="text-center max-w-sm mx-auto space-y-4 py-8">
                        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary animate-pulse">
                          <Smile size={24} />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-sm text-foreground">AI Meeting Intelligence Ready</h3>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                            Analyze details, chats, and speech transcripts from the call using our Groq LLM model to generate meeting summary.
                          </p>
                        </div>
                        <Button 
                          className="w-full font-semibold shadow-md gap-2 bg-gradient-to-r from-primary to-primary/80 hover:scale-[1.01] transition-all"
                          onClick={handleTriggerAI}
                          disabled={aiProcessing}
                        >
                          {aiProcessing ? (
                            <>
                              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Processing AI Report...
                            </>
                          ) : (
                            <>Analyze Meeting with AI</>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4 flex-1 animate-fade-in">
                        <div className="flex items-center justify-between border-b border-border/40 pb-3">
                          <h3 className="text-xs uppercase tracking-wider font-extrabold text-muted-foreground flex items-center gap-1.5">
                            <Smile size={13} className="text-primary" /> AI Generated Summary
                          </h3>
                          <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 px-2 py-0.5 rounded-full">Processed ✓</span>
                        </div>
                        <div className="bg-secondary/15 border border-border/30 rounded-xl p-5 select-text">
                          {renderMarkdown(meeting.summary)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Action Items Tab */}
                {completedTab === 'actionItems' && (
                  <div className="space-y-5 flex-1 flex flex-col relative">
                    {!meeting.aiProcessed ? (
                      <div className="text-center max-w-sm mx-auto space-y-4 py-8 my-auto">
                        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                          <Hand size={24} />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-sm text-foreground">Action Items Extraction</h3>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                            Run the AI Analyzer first to automatically parse call logs and compile action items.
                          </p>
                        </div>
                        <Button 
                          className="w-full font-semibold shadow-md"
                          onClick={handleTriggerAI}
                          disabled={aiProcessing}
                        >
                          {aiProcessing ? 'Processing AI...' : 'Analyze Meeting with AI'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-5 flex-1 flex flex-col animate-fade-in">
                        
                        {/* Kanban Sync Widget */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-primary/5 border border-primary/20 rounded-xl p-4 gap-3">
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-bold text-primary flex items-center gap-1.5">
                              <Hand size={13} /> Kanban Synchronization
                            </h4>
                            <p className="text-[10px] text-muted-foreground">Select a workspace to sync meeting action items as Kanban cards.</p>
                          </div>
                          
                          <div className="flex gap-2 w-full sm:w-auto items-center shrink-0">
                            {workspaces.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground italic">No workspaces found</span>
                            ) : (
                              <>
                                <select
                                  value={selectedWorkspaceId}
                                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                                  className="text-xs font-semibold bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none shrink-0"
                                >
                                  {workspaces.map(w => (
                                    <option key={w._id} value={w._id}>{w.name}</option>
                                  ))}
                                </select>
                                <span className="text-[10px] font-bold text-muted-foreground px-1">workspace</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* List of Tasks */}
                        <div className="flex-1 space-y-3 overflow-y-auto max-h-[350px] pr-1">
                          {(!meeting.actionItems || meeting.actionItems.length === 0) ? (
                            <p className="text-xs text-muted-foreground italic text-center py-10 bg-secondary/15 rounded-xl border border-dashed">
                              No action items were detected by AI.
                            </p>
                          ) : (
                            meeting.actionItems.map((item, idx) => {
                              const isSynced = syncStatus[idx];
                              return (
                                <div key={idx} className="flex justify-between items-center p-3.5 rounded-xl border border-border/40 bg-secondary/15 hover:border-border transition-all gap-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                                      item.priority === 'high' ? 'bg-destructive' : item.priority === 'medium' ? 'bg-amber-500' : 'bg-primary'
                                    }`} title={`${item.priority} priority`} />
                                    
                                    <div className="min-w-0 select-text">
                                      <p className="text-xs font-semibold text-foreground truncate">{item.task}</p>
                                      {item.assigneeName && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Assignee: <span className="font-semibold text-foreground/80">{item.assigneeName}</span></p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge className="text-[9px] uppercase font-extrabold px-1.5" variant={
                                      item.priority === 'high' ? 'destructive' : item.priority === 'medium' ? 'warning' : 'secondary'
                                    }>
                                      {item.priority}
                                    </Badge>
                                    
                                    <Button
                                      size="sm"
                                      variant={isSynced ? 'secondary' : 'outline'}
                                      className={`h-7 px-3 text-[10px] font-bold ${isSynced && 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'}`}
                                      onClick={() => setSyncingTask({ task: item.task, priority: item.priority, index: idx })}
                                      disabled={isSynced || workspaces.length === 0}
                                    >
                                      {isSynced ? 'Synced ✓' : 'Add to Kanban'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Syncing Task Modal */}
                    {syncingTask && (
                      <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 text-foreground select-text">
                          <div className="px-6 py-5 border-b border-border">
                            <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
                              <Sparkles size={15} className="text-primary animate-pulse" /> Add to Kanban Board
                            </h3>
                            <p className="text-[11px] text-muted-foreground mt-1 font-display">Select the target team workspace where this task card should be assigned.</p>
                          </div>
                          
                          <div className="p-6 space-y-4">
                            <div className="space-y-2">
                              <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Task Description</p>
                              <p className="text-xs font-semibold bg-secondary/35 border border-border/40 rounded-xl p-3 select-text italic">"{syncingTask.task}"</p>
                            </div>
                            
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Target Workspace</label>
                              <select
                                value={selectedWorkspaceId}
                                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                                className="w-full text-xs font-semibold bg-secondary border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none cursor-pointer"
                              >
                                {workspaces.map(w => (
                                  <option key={w._id} value={w._id}>{w.name}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40 select-none">
                              <Button type="button" variant="outline" size="sm" onClick={() => setSyncingTask(null)}>
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                onClick={async () => {
                                  await handleAddToKanban(syncingTask.task, syncingTask.priority, syncingTask.index);
                                  setSyncingTask(null);
                                }}
                                size="sm"
                              >
                                Confirm & Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Transcript & Chats Tab */}
                {completedTab === 'transcript' && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    {/* Search bar */}
                    <div className="relative shrink-0">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search spoken transcripts or chat messages…"
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        className="w-full text-xs font-semibold bg-secondary border border-border rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
                    </div>

                    {/* Messages/Transcript scroll area */}
                    <div className="flex-1 overflow-y-auto max-h-[380px] space-y-3.5 pr-1 min-h-[300px]">
                      {completedLogsLoading ? (
                        <div className="text-center py-10 space-y-2">
                          <svg className="animate-spin h-5 w-5 text-primary mx-auto" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-muted-foreground">Loading transcripts and call messages…</p>
                        </div>
                      ) : (() => {
                        const filtered = completedLogs.filter(m => 
                          (m.text || '').toLowerCase().includes(transcriptSearch.toLowerCase()) ||
                          (m.senderName || '').toLowerCase().includes(transcriptSearch.toLowerCase())
                        );

                        if (filtered.length === 0) {
                          return (
                            <p className="text-xs text-muted-foreground text-center py-12 bg-secondary/15 rounded-xl border border-dashed">
                              {transcriptSearch ? 'No matches found.' : 'No chat or spoken transcript logged.'}
                            </p>
                          );
                        }

                        return filtered.map((m, idx) => {
                          const isTranscript = m.type === 'transcript';
                          const isSystem = m.type === 'system';
                          const time = m.createdAt ? format(parseISO(m.createdAt), 'hh:mm a') : 'N/A';

                          if (isSystem) {
                            return (
                              <div key={m._id || idx} className="text-[10px] font-semibold text-center text-muted-foreground py-1 bg-secondary/35 rounded-lg border border-border/20 italic select-text">
                                {m.text}
                              </div>
                            );
                          }

                          return (
                            <div key={m._id || idx} className="flex gap-3 items-start p-3 bg-secondary/10 border border-border/20 rounded-xl hover:bg-secondary/15 transition-all select-text">
                              <Avatar className="h-7 w-7 border border-border">
                                <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                  {m.senderName?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-foreground">{m.senderName}</span>
                                  {isTranscript ? (
                                    <Badge variant="outline" className="text-[8px] bg-primary/5 text-primary border-primary/20 font-bold px-1.5 py-0">Spoken</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[8px] bg-secondary text-muted-foreground border-border/30 font-bold px-1.5 py-0">Chat</Badge>
                                  )}
                                  <span className="text-[9px] text-muted-foreground font-semibold ml-auto">{time}</span>
                                </div>
                                
                                <p className={`text-xs mt-1 leading-relaxed ${isTranscript ? 'italic font-medium text-foreground/80' : 'text-foreground'}`}>
                                  {m.text}
                                </p>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* 5. Play Recording Tab */}
                {completedTab === 'recording' && meeting.recordingUrl && (!meeting.recordedBy || (user && (meeting.recordedBy === user.id || meeting.recordedBy === user._id || meeting.recordedBy?._id === user.id || meeting.recordedBy?._id === user._id))) && (
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex justify-between items-center shrink-0">
                      <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Video size={13} className="text-primary" /> Watch Recorded Meeting
                      </h3>
                      <a 
                        href={meeting.recordingUrl}
                        download={`meeting_recording_${meeting._id}.webm`}
                        className="text-xs text-primary hover:underline font-bold flex items-center gap-1.5"
                      >
                        Download WebM
                      </a>
                    </div>
                    <div className="flex-1 bg-black rounded-2xl overflow-hidden aspect-video border border-border/80 flex items-center justify-center shadow-inner relative group min-h-[300px]">
                      <video 
                        src={meeting.recordingUrl}
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Right Sidebar Area (Metadata & Attendees) */}
            <div className="flex flex-col gap-6">
              
              {/* Session Overview Card */}
              <div className="bg-card/85 border border-border/40 rounded-2xl p-5 shadow-md backdrop-blur-md space-y-4">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/40 pb-2">
                  <Info size={13} className="text-primary" /> Session Details
                </h3>

                <div className="space-y-3.5 text-xs font-semibold text-muted-foreground">
                  <div className="flex justify-between items-center">
                    <span>Host / Organizers</span>
                    <span className="text-foreground">{meeting.host?.name || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Scheduled Date</span>
                    <span className="text-foreground">{meeting.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Scheduled Time</span>
                    <span className="text-foreground">{meeting.time}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Active Call duration</span>
                    <span className="text-foreground">{formattedDuration}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Access Privacy</span>
                    <span className="text-foreground capitalize">{meeting.isPrivate ? 'Private Room' : 'Public Link'}</span>
                  </div>
                </div>
              </div>

              {/* Call Attendees Card */}
              <div className="bg-card/85 border border-border/40 rounded-2xl p-5 shadow-md backdrop-blur-md space-y-4 flex-1">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground flex items-center gap-1.5 border-b border-border/40 pb-2">
                  <Users size={13} className="text-primary" /> Room Participants ({
                    Array.isArray(meeting.participants) ? meeting.participants.length : 0
                  })
                </h3>

                <div className="space-y-3 overflow-y-auto max-h-[300px]">
                  {(!meeting.participants || meeting.participants.length === 0) ? (
                    <p className="text-xs text-muted-foreground italic">No participants list available.</p>
                  ) : (
                    meeting.participants.map((p, idx) => {
                      const name = typeof p === 'object' ? p.name : p;
                      const email = typeof p === 'object' ? p.email : '';
                      return (
                        <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/15 border border-border/20">
                          <Avatar className="h-7 w-7 border border-border">
                            <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                              {name?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{name}</p>
                            {email && <p className="text-[9px] text-muted-foreground truncate">{email}</p>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isFuture) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 bg-background">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 mb-2 mx-auto">
          <Lock size={28} />
        </div>
        <h2 className="font-display font-bold text-xl text-foreground">Meeting has not started yet</h2>
        <p className="text-muted-foreground text-xs max-w-sm mx-auto leading-relaxed">
          This meeting is scheduled for <span className="font-semibold text-foreground">{format(meetingDateTime, 'MMMM d, yyyy')}</span> at <span className="font-semibold text-foreground">{meeting.time}</span>. You can join once the scheduled time arrives.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link to="/meetings?filter=upcoming">
            <Button variant="outline" size="sm" className="gap-2 font-semibold">
              <ArrowLeft size={14} /> View Scheduled
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const date = parseISO(`${meeting.date}T${meeting.time}`)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background animate-fade-in">
      {/* Uploading / Saving Recording Blocker Overlay */}
      {recordingState === 'uploading' && navigateAfterUploadRef.current && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
          <div className="relative flex items-center justify-center">
            <svg className="animate-spin h-10 w-10 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="absolute text-[10px] font-bold text-primary font-mono shrink-0 select-none">MF</span>
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-display font-extrabold text-sm text-foreground tracking-tight">Saving Meeting Recording</h3>
            <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
              We are uploading your call audio and finalizing your session. Please do not close this window.
            </p>
          </div>
        </div>
      )}
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={handleLeave}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-foreground text-sm tracking-tight">{meeting.title}</h1>
              <Badge variant={meeting.status === 'completed' ? 'success' : 'default'} className="text-[9px] uppercase tracking-wide px-1.5 py-0">
                {meeting.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 font-medium">
              <CalendarDays size={11} className="text-primary/60" />
              {format(date, 'EEEE, MMMM d')} · {meeting.time}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {joined && (
            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {(() => {
                const hrs = Math.floor(elapsed / 3600);
                const mins = Math.floor((elapsed % 3600) / 60);
                const secs = elapsed % 60;
                return [
                  hrs > 0 ? String(hrs).padStart(2, '0') : null,
                  String(mins).padStart(2, '0'),
                  String(secs).padStart(2, '0')
                ].filter(Boolean).join(':');
              })()}
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2 text-xs font-semibold px-3.5 shadow-sm" onClick={copyLink}>
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copied ? 'Copied Link!' : 'Invite Friends'}
          </Button>
          {joined && (
            <Button
              variant="outline"
              size="icon"
              className={`h-9 w-9 rounded-lg shadow-sm border transition-all ${
                showSidebar ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
              }`}
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? 'Hide Sidebar' : 'Show Sidebar'}
            >
              {showSidebar ? <X size={15} /> : <Menu size={15} />}
            </Button>
          )}
        </div>
      </header>

      {/* Main room layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Stream grid / preview screen */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[hsl(222,20%,5%)] relative p-6 overflow-y-auto">
          {!joined ? (
            /* Pre-join Lobby UI */
            <div className="w-full max-w-xl bg-card border border-border rounded-2xl p-6 shadow-xl space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="font-display font-extrabold text-xl text-foreground tracking-tight">Camera & Mic Check</h2>
                <p className="text-muted-foreground text-xs leading-relaxed">Choose your devices and check your audio before entering the call</p>
              </div>

              {/* Lobby preview canvas */}
              <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center shadow-inner group w-full">
                <video
                  ref={lobbyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform scale-x-[-1] ${(cam && localStream) ? 'block' : 'hidden'}`}
                />
                {(!cam || !localStream) && (
                  <div className="flex flex-col items-center justify-center gap-2 absolute inset-0 bg-secondary/80">
                    <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center shadow">
                      <Camera size={22} className="text-muted-foreground" />
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold">Camera is blocked or disabled</span>
                  </div>
                )}
                
                {/* Audio volume bar overlay */}
                {mic && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-background/80 backdrop-blur border border-border/40 rounded-lg p-2.5">
                    <Mic size={14} className="text-primary shrink-0" />
                    <div className="flex-1 h-2 bg-secondary rounded overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-75 rounded"
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Media Controls toggles */}
              <div className="flex gap-4 justify-center">
                <Button
                  variant={mic ? 'outline' : 'secondary'}
                  size="sm"
                  className={`gap-2 h-10 w-32 border ${!mic && 'border-destructive text-destructive bg-destructive/5 hover:bg-destructive/10'}`}
                  onClick={() => setMic(!mic)}
                >
                  {mic ? <Mic size={14} /> : <MicOff size={14} />}
                  {mic ? 'Mic active' : 'Mic muted'}
                </Button>
                <Button
                  variant={cam ? 'outline' : 'secondary'}
                  size="sm"
                  className={`gap-2 h-10 w-32 border ${!cam && 'border-destructive text-destructive bg-destructive/5 hover:bg-destructive/10'}`}
                  onClick={() => setCam(!cam)}
                >
                  {cam ? <Video size={14} /> : <VideoOff size={14} />}
                  {cam ? 'Video active' : 'Video off'}
                </Button>
              </div>

              {/* Hardware Selection Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/60 pt-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Camera size={11} className="text-primary/70" /> Select Camera
                  </label>
                  <select
                    value={selectedVideo}
                    onChange={(e) => setSelectedVideo(e.target.value)}
                    className="w-full text-xs font-semibold bg-secondary border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {videoDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${videoDevices.indexOf(d) + 1}`}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Mic size={11} className="text-primary/70" /> Select Mic
                  </label>
                  <select
                    value={selectedAudio}
                    onChange={(e) => setSelectedAudio(e.target.value)}
                    className="w-full text-xs font-semibold bg-secondary border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${audioDevices.indexOf(d) + 1}`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Button className="w-full h-11 text-sm font-semibold tracking-tight hover:scale-[1.01] transition-transform shadow-md" onClick={handleJoin}>
                {isFuture ? 'Start Meeting Call' : 'Join Meeting Call'}
              </Button>
            </div>
          ) : (
            /* Active Meeting Grid Room */
            <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4 overflow-hidden items-center justify-center">
              {pinnedPeer ? (
                /* Spotlight View Layout */
                <div className="w-full h-full flex flex-col md:flex-row gap-4 overflow-hidden">
                  {/* Pinned Large Spotlight Stream */}
                  <div className="flex-1 min-h-0 bg-black/40 border border-border/40 rounded-2xl overflow-hidden relative shadow-2xl flex items-center justify-center">
                    {pinnedPeer === 'local' ? (
                      <VideoView
                        stream={localStream}
                        name={user.name}
                        muted={true}
                        isLocal={true}
                        isVideoOn={cam || screen}
                        isAudioOn={mic}
                        isHandRaised={myHandRaised}
                        mirror={cam && !screen}
                        isPinned={true}
                        onTogglePin={() => setPinnedPeer(null)}
                        lastTranscript={localTranscript}
                      />
                    ) : (() => {
                      const peer = peers.find(p => p.socketId === pinnedPeer.socketId);
                      if (!peer) {
                        // Safe state reset if peer left
                        setTimeout(() => setPinnedPeer(null), 0);
                        return null;
                      }
                      return (
                        <VideoView
                          stream={peer.stream}
                          name={peer.name}
                          muted={false}
                          isLocal={false}
                          isVideoOn={peer.cam}
                          isAudioOn={peer.mic}
                          isHandRaised={raisedHands.has(peer.userId)}
                          isPinned={true}
                          onTogglePin={() => setPinnedPeer(null)}
                          lastTranscript={peer.lastTranscript}
                        />
                      );
                    })()}
                  </div>

                  {/* Sidebar/Bottom scroll for unpinned participants */}
                  <div className="w-full md:w-60 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto shrink-0 pb-2 md:pb-0 pr-1 select-none custom-scrollbar">
                    {/* Render local self stream if not pinned */}
                    {pinnedPeer !== 'local' && (
                      <div className="w-48 md:w-full aspect-video shrink-0 rounded-xl overflow-hidden border border-border/40 hover:border-primary/50 transition-all duration-200 shadow-md">
                        <VideoView
                          stream={localStream}
                          name={user.name}
                          muted={true}
                          isLocal={true}
                          isVideoOn={cam || screen}
                          isAudioOn={mic}
                          isHandRaised={myHandRaised}
                          mirror={cam && !screen}
                          onTogglePin={() => setPinnedPeer('local')}
                          lastTranscript={localTranscript}
                        />
                      </div>
                    )}
                    {/* Render other peers if not pinned */}
                    {peers.map((p) => {
                      if (pinnedPeer !== 'local' && pinnedPeer.socketId === p.socketId) return null;
                      return (
                        <div key={p.socketId} className="w-48 md:w-full aspect-video shrink-0 rounded-xl overflow-hidden border border-border/40 hover:border-primary/50 transition-all duration-200 shadow-md">
                          <VideoView
                            stream={p.stream}
                            name={p.name}
                            muted={false}
                            isLocal={false}
                            isVideoOn={p.cam}
                            isAudioOn={p.mic}
                            isHandRaised={raisedHands.has(p.userId)}
                            onTogglePin={() => setPinnedPeer({ socketId: p.socketId })}
                            lastTranscript={p.lastTranscript}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : peers.length === 0 ? (
                /* Only Self View */
                <div className="w-full max-w-2xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-border">
                  <VideoView
                    stream={localStream}
                    name={user.name}
                    muted={true}
                    isLocal={true}
                    isVideoOn={cam || screen}
                    isAudioOn={mic}
                    isHandRaised={myHandRaised}
                    mirror={cam && !screen}
                    onTogglePin={() => setPinnedPeer('local')}
                    lastTranscript={localTranscript}
                  />
                </div>
              ) : (
                /* Dynamic Responsive Grid Layout */
                <div className={`w-full max-w-5xl grid gap-4 ${
                  peers.length === 1 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                  {/* Local Self stream */}
                  <VideoView
                    stream={localStream}
                    name={user.name}
                    muted={true}
                    isLocal={true}
                    isVideoOn={cam || screen}
                    isAudioOn={mic}
                    isHandRaised={myHandRaised}
                    mirror={cam && !screen}
                    onTogglePin={() => setPinnedPeer('local')}
                    lastTranscript={localTranscript}
                  />
                  {/* Remote Participant Streams */}
                  {peers.map((p) => (
                    <VideoView
                      key={p.socketId}
                      stream={p.stream}
                      name={p.name}
                      muted={false}
                      isLocal={false}
                      isVideoOn={p.cam}
                      isAudioOn={p.mic}
                      isHandRaised={raisedHands.has(p.userId)}
                      onTogglePin={() => setPinnedPeer({ socketId: p.socketId })}
                      lastTranscript={p.lastTranscript}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Floating Emoji Reactions Overlay */}
          {joined && (
            <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
              {floatingReactions.map((r) => (
                <div
                  key={r.id}
                  className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-float-emoji pointer-events-none"
                  style={{
                    animation: 'floatUp 3s ease-out forwards',
                    left: `${35 + Math.random() * 30}%`,
                  }}
                >
                  <span className="text-4xl filter drop-shadow-md select-none">{r.emoji}</span>
                  <span className="text-[10px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded-full font-display font-semibold backdrop-blur shadow-sm">
                    {r.senderName}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Floating Toasts Notification Overlay */}
          {toasts.length > 0 && (
            <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
              {toasts.map((t) => (
                <div
                  key={t.id}
                  className={`px-4 py-3 rounded-xl shadow-2xl font-display font-semibold text-xs border backdrop-blur flex items-center gap-2.5 pointer-events-auto bg-card animate-fade-in ${
                    t.type === 'system'
                      ? 'border-primary/20 text-foreground'
                      : t.type === 'hand'
                      ? 'border-amber-500/30 text-amber-400 bg-amber-500/5'
                      : t.type === 'reaction'
                      ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5'
                      : 'border-border text-muted-foreground'
                  }`}
                  style={{
                    transition: 'all 0.3s ease',
                  }}
                >
                  {t.type === 'system' && <Info size={13} className="text-primary shrink-0" />}
                  {t.type === 'hand' && <Hand size={13} className="text-amber-500 animate-bounce shrink-0" />}
                  {t.type === 'reaction' && <Smile size={13} className="text-emerald-500 shrink-0" />}
                  <span>{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Sidebar Control Panel */}
        {joined && showSidebar && (
          <div className="w-full md:w-80 border-l border-border bg-card flex flex-col shrink-0 shadow-lg relative md:static absolute inset-y-0 right-0 z-30 animate-fade-in">
            <div className="flex border-b border-border bg-secondary/15">
              {[
                { id: 'info', icon: Info, label: 'Details' },
                { id: 'people', icon: Users, label: 'Members' },
                { id: 'chat', icon: MessageSquare, label: 'Chat', badge: unreadChat },
                { id: 'notes', icon: FileText, label: 'Notes' },
                { id: 'activity', icon: History, label: 'Activity' },
              ].map(({ id: tId, icon: Icon, label, badge }) => (
                <button
                  key={tId}
                  onClick={() => setTab(tId)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 text-[9px] font-display font-bold uppercase tracking-wider transition-all border-b-2 relative ${
                    tab === tId
                      ? 'border-primary text-primary bg-background/50'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{label}</span>
                  {badge > 0 && (
                    <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[8px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center border border-card animate-pulse shadow-sm">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              {tab === 'info' && (
                <div className="space-y-5 animate-fade-in flex-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2.5">Schedule Information</p>
                    <div className="space-y-3 text-xs font-semibold">
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <CalendarDays size={14} className="text-primary/70 shrink-0" />
                        <span>{format(date, 'MMMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <Clock size={14} className="text-primary/70 shrink-0" />
                        <span>{meeting.time}</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-muted-foreground">
                        <Users size={14} className="text-primary/70 shrink-0" />
                        <span>{peers.length + 1} Active call members</span>
                      </div>
                    </div>
                  </div>
                  {meeting.description && (
                    <div className="border-t border-border pt-4">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Agenda / Description</p>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-secondary/35 border border-border/30 rounded-xl p-3">{meeting.description}</p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'people' && (
                <div className="space-y-3 animate-fade-in flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                    Online in Call ({peers.length + 1})
                  </p>
                  {/* Self */}
                  <div className="flex items-center gap-3 py-2 border-b border-border/30">
                    <Avatar className="h-8 w-8 border border-border shadow-sm">
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                        {user?.name?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold text-foreground flex-1">{user?.name} <span className="text-[10px] text-primary">(You)</span></span>
                    <div className="flex items-center gap-2">
                      {myHandRaised && <Hand size={12} className="text-amber-500 fill-amber-500 animate-bounce shrink-0" />}
                      {mic ? (
                        <Mic size={13} className="text-primary/80" />
                      ) : (
                        <MicOff size={13} className="text-destructive" />
                      )}
                    </div>
                  </div>
                  {/* Peers */}
                  {peers.map((p) => (
                    <div key={p.socketId} className="flex items-center gap-3 py-2 border-b border-border/20">
                      <Avatar className="h-8 w-8 border border-border shadow-sm">
                        <AvatarFallback className="text-xs font-semibold">
                          {p.name?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-semibold text-foreground flex-1">{p.name}</span>
                      <div className="flex items-center gap-2">
                        {raisedHands.has(p.userId) && <Hand size={12} className="text-amber-500 fill-amber-500 animate-bounce shrink-0" />}
                        {p.mic ? (
                          <Mic size={13} className="text-primary/80" />
                        ) : (
                          <MicOff size={13} className="text-destructive animate-pulse" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'chat' && (
                <div className="flex flex-col h-full flex-1 gap-3 animate-fade-in justify-between">
                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[calc(100vh-250px)] min-h-[200px]">
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-10 bg-secondary/20 border border-dashed border-border rounded-xl">
                        No messages yet. Start chatting!
                      </p>
                    ) : (
                      chatMessages.map((m, idx) => {
                        const isSystem = m.type === 'system';
                        if (isSystem) {
                          return (
                            <div key={m._id || idx} className="text-[10px] font-semibold text-center text-muted-foreground py-1 bg-secondary/30 rounded-lg border border-border/30 italic">
                              {m.text}
                            </div>
                          );
                        }
                        const isSelf = m.senderId === user.id;
                        return (
                          <div key={m._id || idx} className={`flex flex-col gap-1 max-w-[85%] ${isSelf ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                            <div className="flex items-center gap-1.5 text-[9px] font-display font-bold text-muted-foreground">
                              <span>{m.senderName}</span>
                              <span>·</span>
                              <span>{new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed font-medium shadow-sm break-all ${
                              isSelf ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-secondary border border-border/30 text-foreground rounded-tl-none'
                            }`}>
                              {m.text}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Typing and Form */}
                  <div className="space-y-2 pt-2 border-t border-border/60 shrink-0">
                    {typingUsers.length > 0 && (
                      <p className="text-[9px] font-semibold text-muted-foreground animate-pulse mb-1.5">
                        {typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                      </p>
                    )}
                    
                    {chatSummary && (
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl relative animate-fade-in text-xs text-foreground leading-relaxed shadow-sm mb-2">
                        <button
                          type="button"
                          onClick={() => setChatSummary("")}
                          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          title="Close Summary"
                        >
                          <X size={12} />
                        </button>
                        <div className="flex items-center gap-1.5 font-display font-extrabold text-[10px] text-primary uppercase tracking-wider mb-1">
                          <Sparkles size={11} className="text-primary animate-pulse" /> Chat Summary
                        </div>
                        <p className="pr-4 font-medium select-text">{chatSummary}</p>
                      </div>
                    )}

                    <form onSubmit={sendChatMessage} className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={handleTyping}
                        placeholder="Type a message..."
                        className="flex-1 text-xs font-semibold bg-secondary border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
                      <Button
                        type="button"
                        onClick={handleSummarizeChats}
                        disabled={summarizingChats}
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 rounded-xl shadow-md shrink-0 border-primary/25 text-primary bg-primary/5 hover:bg-primary/10"
                        title="Summarize Chat Messages"
                      >
                        {summarizingChats ? (
                          <svg className="animate-spin h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <Sparkles size={14} />
                        )}
                      </Button>
                      <Button type="submit" size="icon" className="h-9 w-9 rounded-xl shadow-md shrink-0">
                        <Send size={14} />
                      </Button>
                    </form>
                  </div>
                </div>
              )}

              {tab === 'notes' && (
                <div className="flex flex-col h-full flex-1 gap-3 animate-fade-in">
                  <div className="flex items-center justify-between shrink-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Shared Call Notes</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      notesSaveStatus === 'saving' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {notesSaveStatus === 'saving' ? 'Saving...' : 'Saved ✓'}
                    </span>
                  </div>
                  <textarea
                    value={sharedNotes}
                    onChange={handleNotesChange}
                    placeholder="Collaborate on meeting notes here in real-time..."
                    className="flex-1 text-xs font-semibold bg-secondary border border-border rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-primary text-foreground resize-none leading-relaxed font-body min-h-[250px]"
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold px-1 shrink-0">
                    <span>Auto-syncs across all members</span>
                    <span>{sharedNotes.length} chars</span>
                  </div>
                </div>
              )}

              {tab === 'activity' && (
                <div className="space-y-3 animate-fade-in flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                    Call Activity Feed
                  </p>
                  <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                    {activityFeed.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-10 bg-secondary/20 border border-dashed border-border rounded-xl">
                        No meeting activity logged yet.
                      </p>
                    ) : (
                      activityFeed.map((a, idx) => (
                        <div key={a.id || idx} className="flex gap-2.5 items-start text-[11px] font-medium leading-normal bg-secondary/35 border border-border/20 rounded-xl p-2.5 shadow-sm">
                          <span className="text-[9px] font-semibold text-muted-foreground bg-secondary/80 border border-border/40 rounded px-1.5 shrink-0 select-none">
                            {a.time}
                          </span>
                          <span className="text-foreground font-semibold">{a.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control panel bar */}
      {joined && (
        <footer className="flex flex-col sm:flex-row items-center justify-center gap-4 py-4 border-t border-border bg-card shrink-0 shadow-lg z-10 px-6">
          <div className="flex items-center gap-4">
            <Button
              variant={mic ? 'outline' : 'secondary'}
              size="icon"
              className={`h-11 w-11 rounded-full border shadow transition-all ${!mic && 'border-destructive text-destructive bg-destructive/5 hover:bg-destructive/10'}`}
              onClick={toggleMic}
              title={mic ? 'Mute Mic' : 'Unmute Mic'}
            >
              {mic ? <Mic size={17} /> : <MicOff size={17} />}
            </Button>
            <Button
              variant={cam ? 'outline' : 'secondary'}
              size="icon"
              className={`h-11 w-11 rounded-full border shadow transition-all ${!cam && 'border-destructive text-destructive bg-destructive/5 hover:bg-destructive/10'}`}
              onClick={toggleCam}
              title={cam ? 'Turn Off Cam' : 'Turn On Cam'}
            >
              {cam ? <Video size={17} /> : <VideoOff size={17} />}
            </Button>
            <Button
              variant={screen ? 'default' : 'outline'}
              size="icon"
              className={`h-11 w-11 rounded-full border shadow transition-all ${screen && 'bg-primary border-primary hover:bg-primary/95 text-white'}`}
              onClick={toggleScreenShare}
              title={screen ? 'Stop Screen Share' : 'Share Screen'}
            >
              <MonitorUp size={17} />
            </Button>

            {/* Recording Controls */}
            {recordingState === 'recording' ? (
              <Button
                variant="destructive"
                size="icon"
                className="h-11 w-11 rounded-full border border-destructive shadow animate-pulse hover:bg-destructive/95 transition-all text-white flex items-center justify-center"
                onClick={stopRecording}
                title={`Stop Recording (${formatTime(recordingDuration)})`}
              >
                <div className="h-3 w-3 bg-white rounded-sm shrink-0" />
              </Button>
            ) : recordingState === 'uploading' || recordingState === 'processing' ? (
              <Button
                variant="outline"
                size="icon"
                disabled
                className="h-11 w-11 rounded-full border border-primary/40 text-primary bg-primary/5 shadow transition-all cursor-wait flex items-center justify-center"
                title={recordingState === 'uploading' ? 'Uploading recording...' : 'AI Processing...'}
              >
                <svg className="animate-spin h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full border border-border shadow text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all flex items-center justify-center"
                onClick={startRecording}
                title="Start Recording Meeting"
              >
                <span className="h-3 w-3 bg-destructive rounded-full shrink-0 animate-pulse" />
              </Button>
            )}
            <Button
              variant={myHandRaised ? 'secondary' : 'outline'}
              size="icon"
              className={`h-11 w-11 rounded-full border shadow transition-all ${
                myHandRaised ? 'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white shadow-amber-500/10' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={toggleHandRaise}
              title={myHandRaised ? 'Lower Hand' : 'Raise Hand'}
            >
              <Hand size={17} className={myHandRaised ? 'fill-white' : ''} />
            </Button>
            <Button
              variant={aiTranscribe ? 'outline' : 'secondary'}
              size="icon"
              className={`h-11 w-11 rounded-full border shadow transition-all ${
                aiTranscribe ? 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10' : 'border-border text-muted-foreground'
              }`}
              onClick={() => {
                setAiTranscribe(!aiTranscribe);
                addToast(`AI Transcription ${!aiTranscribe ? 'enabled' : 'disabled'}`, 'info');
              }}
              title={aiTranscribe ? 'Disable AI Transcription' : 'Enable AI Transcription'}
            >
              <Sparkles size={17} className={aiTranscribe ? 'animate-pulse text-primary' : ''} />
            </Button>
          </div>

          {/* Premium Emoji Reactions Row */}
          <div className="flex items-center bg-secondary/40 border border-border/40 rounded-full px-4 py-2 gap-3 shadow-inner">
            {['👍', '👏', '😂', '❤️', '🎉', '🔥'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="hover:scale-135 active:scale-95 transition-all text-base filter drop-shadow-sm select-none duration-150 cursor-pointer"
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex items-center sm:ml-auto">
            <Button
              variant="destructive"
              size="icon"
              className="h-11 w-11 rounded-full shadow hover:bg-destructive/95 transition-all"
              onClick={handleLeave}
              title="Leave Call Room"
            >
              <PhoneOff size={17} />
            </Button>
          </div>
        </footer>
      )}
    </div>
  )
}

