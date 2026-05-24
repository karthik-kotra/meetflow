import { Link } from 'react-router-dom'
import { CalendarDays, Clock, Users, Plus, ArrowRight, Video, Zap, Phone } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMeetings } from '@/context/MeetingsContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns'
import { useState } from 'react'

function MeetingCard({ meeting }) {
  const date = parseISO(`${meeting.date}T${meeting.time}`)
  const isLive = isToday(date) && !isPast(date)

  const dateLabel = isToday(date)
    ? 'Today'
    : isTomorrow(date)
    ? 'Tomorrow'
    : format(date, 'MMM d, yyyy')

  return (
    <div className="group flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all duration-200">
      <div className={`flex items-center justify-center w-11 h-11 rounded-lg shrink-0 ${isLive ? 'bg-primary/20 border border-primary/40' : 'bg-secondary border border-border'}`}>
        <Video size={18} className={isLive ? 'text-primary' : 'text-muted-foreground'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display font-semibold text-sm text-foreground truncate">{meeting.title}</p>
          {isLive && <Badge variant="default" className="text-[10px] shrink-0">Live</Badge>}
          {meeting.status === 'completed' && <Badge variant="success" className="text-[10px] shrink-0">Done</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{meeting.description}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CalendarDays size={12} />{dateLabel}</span>
          <span className="flex items-center gap-1"><Clock size={12} />{meeting.time}</span>
          <span className="flex items-center gap-1"><Users size={12} />{meeting.participants}</span>
        </div>
      </div>
      <Link to={`/meeting/${meeting.id}`}>
        <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
          <ArrowRight size={14} />
        </Button>
      </Link>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { meetings, ongoingMeetings, upcomingMeetings } = useMeetings()
  const [joinedMeetingId, setJoinedMeetingId] = useState(null)

  const completed = meetings.filter((m) => m.status === 'completed')

  const stats = [
    { label: 'Total Meetings', value: meetings.length, icon: CalendarDays, color: 'text-primary' },
    { label: "Today's Meetings", value: ongoingMeetings.length, icon: Zap, color: 'text-red-400' },
    { label: 'Upcoming', value: upcomingMeetings.length, icon: Clock, color: 'text-amber-400' },
    { label: 'Completed', value: completed.length, icon: Users, color: 'text-emerald-400' },
  ]

  const handleJoinMeeting = (meetingId) => {
    setJoinedMeetingId(joinedMeetingId === meetingId ? null : meetingId)
  }

  // Sort ongoing meetings by time
  const sortedOngoingMeetings = [...ongoingMeetings].sort((a, b) => {
    const timeA = a.time.split(':').map(Number)
    const timeB = b.time.split(':').map(Number)
    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1])
  })

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'},{' '}
            <span className="text-primary">{user?.name?.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Link to="/create-meeting">
          <Button className="gap-2">
            <Plus size={16} /> New Meeting
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }, i) => (
          <div
            key={label}
            className="bg-card border border-border rounded-xl p-5 animate-fade-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <p className={`font-display text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Ongoing meetings */}
      {ongoingMeetings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40">
                <Zap size={16} className="text-red-400 animate-pulse" />
              </div>
              <h2 className="font-display font-semibold text-foreground">Today's Meetings</h2>
            </div>
            <Link to="/ongoing-meetings" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {sortedOngoingMeetings.slice(0, 3).map((m) => {
              const date = parseISO(`${m.date}T${m.time}`)
              const isJoined = joinedMeetingId === m.id
              return (
                <div key={m.id} className="group bg-gradient-to-r from-primary/10 to-transparent border-2 border-primary/40 rounded-xl p-4 hover:border-primary/60 transition-all duration-200 flex items-start gap-4">
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-primary/20 border border-primary/40 shrink-0">
                    <Video size={18} className="text-primary animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-display font-semibold text-sm text-foreground truncate">{m.title}</p>
                      <Badge variant="default" className="text-[10px] shrink-0 animate-pulse">
                        <Zap size={10} className="mr-1" /> SCHEDULED
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{m.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock size={12} />{format(date, 'h:mm a')}</span>
                      <span className="flex items-center gap-1"><Users size={12} />{m.participants} participants</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button 
                      size="sm" 
                      className={isJoined ? "gap-2 bg-red-500 hover:bg-red-600" : "gap-2 bg-primary hover:bg-primary/90"}
                      onClick={() => handleJoinMeeting(m.id)}
                    >
                      <Phone size={14} /> {isJoined ? "Leave" : "Join"}
                    </Button>
                    <Link to={`/meeting/${m.id}`}>
                      <Button size="sm" variant="outline">
                        <ArrowRight size={14} />
                      </Button>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming meetings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground">Upcoming Meetings</h2>
          <Link to="/meetings" className="text-xs text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {upcomingMeetings.length === 0 ? (
          <div className="text-center py-12 bg-card border border-dashed border-border rounded-xl">
            <CalendarDays size={36} className="text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">No upcoming meetings</p>
            <Link to="/create-meeting">
              <Button variant="outline" size="sm" className="mt-4 gap-2">
                <Plus size={14} /> Schedule one
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingMeetings.slice(0, 4).map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </div>

      {/* Recent completed */}
      {completed.length > 0 && (
        <div>
          <h2 className="font-display font-semibold text-foreground mb-4">Recent Meetings</h2>
          <div className="space-y-3">
            {completed.slice(0, 2).map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
