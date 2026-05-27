import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  MessageSquare, Users, CalendarDays, Clock, ArrowLeft,
  Copy, Check, Info, Settings, Camera, Lock,
  FileText, History, Smile, Hand, Send, Menu, X
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
function VideoView({ stream, name, muted, isLocal, isVideoOn, isAudioOn, isHandRaised }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="relative bg-card rounded-xl border border-border overflow-hidden flex items-center justify-center aspect-video shadow-md hover:shadow-lg transition-all duration-200 w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover transform scale-x-[-1] ${(isVideoOn && stream) ? 'block' : 'hidden'}`}
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
  const { fetchMeetingDetails, updateMeetingStatus } = useMeetings()
  const { user } = useAuth()
  const { updateStatus } = useChat() || {}
  const navigate = useNavigate()

  // State Management
  const [meeting, setMeeting] = useState(null)
  const [loadingMeeting, setLoadingMeeting] = useState(true)
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
  const typingTimeoutRef = useRef(null)
  const notesTimeoutRef = useRef(null)
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
  useEffect(() => {
    localStreamRef.current = localStream
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
    }
  }, [])

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
        setMeeting(details)
      } catch (err) {
        console.error('Error fetching meeting details:', err)
      } finally {
        setLoadingMeeting(false)
      }
    }
    loadDetails()
  }, [id, fetchMeetingDetails])

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
        // Prompt initial permission grant
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
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
      const constraints = {
        video: cam ? (vDeviceId ? { deviceId: { exact: vDeviceId } } : true) : false,
        audio: mic ? (aDeviceId ? { deviceId: { exact: aDeviceId } } : true) : false
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setLocalStream(stream)
      
      // Sync track enabled values
      stream.getVideoTracks().forEach(t => t.enabled = cam)
      stream.getAudioTracks().forEach(t => t.enabled = mic)
    } catch (err) {
      console.warn('Initial media grab failed, attempting audio-only fallback (camera might be locked):', err)
      try {
        // Fallback: try audio-only if camera is locked/blocked by another browser
        const audioOnlyConstraints = {
          video: false,
          audio: mic ? (aDeviceId ? { deviceId: { exact: aDeviceId } } : true) : true
        }
        const audioStream = await navigator.mediaDevices.getUserMedia(audioOnlyConstraints)
        setLocalStream(audioStream)
        audioStream.getAudioTracks().forEach(t => t.enabled = mic)
        
        // Explicitly set camera state to off since it failed to grab
        setCam(false)
      } catch (fallbackErr) {
        console.error('Audio fallback failed as well:', fallbackErr)
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
        pc.addTrack(track, stream)
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

    const socket = io('http://localhost:5000', {
      withCredentials: true
    })
    socketRef.current = socket

    const loadChatHistory = async () => {
      try {
        const res = await fetch('/api/meeting-chat/' + meeting.roomId + '/messages')
        if (res.ok) {
          const data = await res.json()
          setChatMessages(data)
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

  const toggleMic = () => {
    const nextMic = !mic
    setMic(nextMic)
    
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = nextMic)
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
    
    if (nextCam) {
      const existingVideoTrack = localStream ? localStream.getVideoTracks()[0] : null
      if (existingVideoTrack) {
        existingVideoTrack.enabled = true
        if (socketRef.current) {
          socketRef.current.emit('toggle_media', {
            roomId: meeting?.roomId || id,
            type: 'video',
            enabled: true
          })
        }
      } else {
        // Fallback: Camera was not active (e.g. locked earlier). Try to capture it now!
        try {
          const constraints = {
            video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
            audio: false
          }
          const camStream = await navigator.mediaDevices.getUserMedia(constraints)
          const camTrack = camStream.getVideoTracks()[0]
          camTrack.enabled = true
          
          await updateVideoTrackOnPeers(camTrack)
          
          const combined = new MediaStream([camTrack, ...(localStream ? localStream.getAudioTracks() : [])])
          setLocalStream(combined)
          
          if (socketRef.current) {
            socketRef.current.emit('toggle_media', {
              roomId: meeting?.roomId || id,
              type: 'video',
              enabled: true
            })
          }
        } catch (err) {
          console.error('Failed to capture camera track on toggle:', err)
          setCam(false)
        }
      }
    } else {
      if (localStream) {
        localStream.getVideoTracks().forEach(t => t.enabled = false)
      }
      if (socketRef.current) {
        socketRef.current.emit('toggle_media', {
          roomId: meeting?.roomId || id,
          type: 'video',
          enabled: false
        })
      }
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

  const handleLeave = () => {
    cleanupConnections()
    navigate('/meetings')
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
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 bg-background">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 text-destructive mb-2 mx-auto">
          <PhoneOff size={28} />
        </div>
        <h2 className="font-display font-bold text-xl text-foreground">This meeting has ended</h2>
        <p className="text-muted-foreground text-xs max-w-sm mx-auto leading-relaxed">
          The host or participants have left, and this meeting session is now completed. It is no longer available to join.
        </p>
        <Link to="/meetings">
          <Button variant="outline" size="sm" className="gap-2 font-semibold mt-2">
            <ArrowLeft size={14} /> Back to Meetings
          </Button>
        </Link>
      </div>
    )
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
                  ref={(v) => { if (v && localStream) v.srcObject = localStream }}
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

              <Button className="w-full h-11 text-sm font-semibold tracking-tight animate-pulse" onClick={handleJoin}>
                {isFuture ? 'Start Meeting Call' : 'Join Meeting Call'}
              </Button>
            </div>
          ) : (
            /* Active Meeting Grid Room */
            <div className="w-full h-full flex items-center justify-center p-4">
              {peers.length === 0 ? (
                /* Only Self View */
                <div className="w-full max-w-2xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-border">
                  <VideoView
                    stream={localStream}
                    name={user.name}
                    muted={true}
                    isLocal={true}
                    isVideoOn={cam}
                    isAudioOn={mic}
                    isHandRaised={myHandRaised}
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
                    isVideoOn={cam}
                    isAudioOn={mic}
                    isHandRaised={myHandRaised}
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
                      <p className="text-[9px] font-semibold text-muted-foreground animate-pulse">
                        {typingUsers.map(u => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                      </p>
                    )}
                    <form onSubmit={sendChatMessage} className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={handleTyping}
                        placeholder="Type a message..."
                        className="flex-1 text-xs font-semibold bg-secondary border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      />
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

