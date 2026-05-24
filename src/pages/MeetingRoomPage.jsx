import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  MessageSquare, Users, CalendarDays, Clock, ArrowLeft,
  Copy, Check, Info,
} from 'lucide-react'
import { useMeetings } from '@/context/MeetingsContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { format, parseISO } from 'date-fns'

const FAKE_PARTICIPANTS = []

export default function MeetingRoomPage() {
  const { id } = useParams()
  const { getMeeting } = useMeetings()
  const { user } = useAuth()
  const { updateStatus } = useChat() || {}
  const navigate = useNavigate()
  const meeting = getMeeting(id)

  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [screen, setScreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('info') // 'info' | 'people' | 'chat'
  const [elapsed, setElapsed] = useState(0)
  const [joined, setJoined] = useState(false)

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

  useEffect(() => {
    if (!joined) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [joined])

  const formatTime = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!meeting) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Meeting not found.</p>
        <Link to="/meetings">
          <Button variant="outline" size="sm" className="mt-4">Back to Meetings</Button>
        </Link>
      </div>
    )
  }

  const date = parseISO(`${meeting.date}T${meeting.time}`)

  return (
    <div className="flex flex-col h-screen bg-background animate-fade-in">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/meetings">
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-semibold text-foreground text-sm">{meeting.title}</h1>
              <Badge variant={meeting.status === 'completed' ? 'success' : 'default'} className="text-[10px]">
                {meeting.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <CalendarDays size={11} />
              {format(date, 'EEEE, MMMM d')} · {meeting.time}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {joined && (
            <span className="font-mono text-sm text-primary bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1">
              {formatTime(elapsed)}
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={copyLink}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[hsl(222,20%,5%)] relative p-6 gap-4">
          {!joined ? (
            /* Pre-join lobby */
            <div className="text-center space-y-5 animate-fade-in">
              <div className="w-32 h-32 rounded-full bg-card border-2 border-border flex items-center justify-center mx-auto">
                <Avatar className="w-24 h-24">
                  <AvatarFallback className="text-3xl">{user?.name?.[0]}</AvatarFallback>
                </Avatar>
              </div>
              <div>
                <h2 className="font-display font-bold text-xl text-foreground">Ready to join?</h2>
                <p className="text-muted-foreground text-sm mt-1">{meeting.title}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button
                  variant={mic ? 'outline' : 'secondary'}
                  size="sm"
                  className="gap-2"
                  onClick={() => setMic(!mic)}
                >
                  {mic ? <Mic size={14} /> : <MicOff size={14} />}
                  {mic ? 'Mic on' : 'Mic off'}
                </Button>
                <Button
                  variant={cam ? 'outline' : 'secondary'}
                  size="sm"
                  className="gap-2"
                  onClick={() => setCam(!cam)}
                >
                  {cam ? <Video size={14} /> : <VideoOff size={14} />}
                  {cam ? 'Cam on' : 'Cam off'}
                </Button>
              </div>
              <Button className="w-48 h-11" onClick={() => setJoined(true)}>
                Join Meeting
              </Button>
            </div>
          ) : (
            /* In-meeting grid */
            <div className="w-full h-full grid grid-cols-2 gap-3 max-w-4xl">
              {/* Self */}
              <div className="relative bg-card rounded-xl border border-border overflow-hidden flex items-center justify-center aspect-video">
                {cam ? (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary flex items-center justify-center">
                    <Avatar className="w-16 h-16">
                      <AvatarFallback className="text-xl">{user?.name?.[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                ) : (
                  <div className="w-full h-full bg-secondary flex items-center justify-center">
                    <VideoOff size={28} className="text-muted-foreground" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-background/70 backdrop-blur-sm rounded-md px-2 py-1">
                  {mic ? <Mic size={11} className="text-primary" /> : <MicOff size={11} className="text-destructive" />}
                  <span className="text-xs font-display">{user?.name} (You)</span>
                </div>
              </div>

              {/* Fake participants */}
              {FAKE_PARTICIPANTS.slice(0, 3).map((name) => (
                <div key={name} className="relative bg-card rounded-xl border border-border overflow-hidden flex items-center justify-center aspect-video">
                  <div className="w-full h-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                    <Avatar className="w-14 h-14">
                      <AvatarFallback>{name[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-background/70 backdrop-blur-sm rounded-md px-2 py-1">
                    <Mic size={11} className="text-primary" />
                    <span className="text-xs font-display">{name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-72 border-l border-border bg-card flex flex-col shrink-0">
          <div className="flex border-b border-border">
            {[
              { id: 'info', icon: Info, label: 'Info' },
              { id: 'people', icon: Users, label: 'People' },
              { id: 'chat', icon: MessageSquare, label: 'Chat' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-display font-medium transition-colors border-b-2 ${
                  tab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'info' && (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display font-semibold mb-2">Details</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <CalendarDays size={14} className="mt-0.5 shrink-0 text-primary/60" />
                      <span>{format(date, 'MMMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Clock size={14} className="mt-0.5 shrink-0 text-primary/60" />
                      <span>{meeting.time}</span>
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Users size={14} className="mt-0.5 shrink-0 text-primary/60" />
                      <span>{meeting.participants} participants</span>
                    </div>
                  </div>
                </div>
                {meeting.description && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display font-semibold mb-2">Description</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{meeting.description}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'people' && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display font-semibold mb-3">
                  {joined ? 4 : 1} in meeting
                </p>
                {[user?.name, ...(joined ? FAKE_PARTICIPANTS : [])].map((name) => (
                  <div key={name} className="flex items-center gap-3 py-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{name?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground flex-1">{name} {name === user?.name && '(You)'}</span>
                    <Mic size={13} className="text-primary/60" />
                  </div>
                ))}
              </div>
            )}

            {tab === 'chat' && (
              <div className="flex flex-col h-full gap-3">
                <div className="flex-1 space-y-3">
                  {joined && (
                    <>
                    </>
                  )}
                  {!joined && (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Join the meeting to chat.
                    </p>
                  )}
                </div>
                {joined && (
                  <input
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Type a message…"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      {joined && (
        <footer className="flex items-center justify-center gap-3 py-4 border-t border-border bg-card shrink-0">
          <Button
            variant={mic ? 'outline' : 'secondary'}
            size="icon"
            className={`h-11 w-11 rounded-full ${!mic && 'border-destructive text-destructive'}`}
            onClick={() => setMic(!mic)}
            title={mic ? 'Mute' : 'Unmute'}
          >
            {mic ? <Mic size={18} /> : <MicOff size={18} />}
          </Button>
          <Button
            variant={cam ? 'outline' : 'secondary'}
            size="icon"
            className={`h-11 w-11 rounded-full ${!cam && 'border-destructive text-destructive'}`}
            onClick={() => setCam(!cam)}
            title={cam ? 'Stop video' : 'Start video'}
          >
            {cam ? <Video size={18} /> : <VideoOff size={18} />}
          </Button>
          <Button
            variant={screen ? 'default' : 'outline'}
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => setScreen(!screen)}
            title="Share screen"
          >
            <MonitorUp size={18} />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={() => navigate('/meetings')}
            title="Leave meeting"
          >
            <PhoneOff size={18} />
          </Button>
        </footer>
      )}
    </div>
  )
}
