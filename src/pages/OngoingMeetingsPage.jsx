import { Link } from 'react-router-dom'
import { Zap, Video, Clock, Users, ArrowRight, Plus, Phone, PhoneOff } from 'lucide-react'
import { useMeetings } from '@/context/MeetingsContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'
import { useState } from 'react'

function OngoingMeetingCard({ meeting, onJoin, joinedMeetingId }) {
  const date = parseISO(`${meeting.date}T${meeting.time}`)
  const isJoined = joinedMeetingId === (meeting._id || meeting.roomId)

  return (
    <div className="group bg-gradient-to-br from-primary/10 to-transparent border-2 border-primary/40 rounded-xl p-6 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 flex flex-col gap-4 animate-pulse-subtle">
      {/* Top row with icon and badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/20 border border-primary/40 shrink-0">
          <Video size={20} className="text-primary animate-pulse" />
        </div>
        <Badge className="bg-primary text-white text-[10px] animate-pulse">
          <Zap size={10} className="mr-1" /> SCHEDULED
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1">
        <h3 className="font-display font-semibold text-lg text-foreground">{meeting.title}</h3>
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{meeting.description}</p>
      </div>

      {/* Meeting info */}
      <div className="flex flex-col sm:flex-row gap-3 text-sm text-muted-foreground border-t border-primary/20 pt-4">
        <span className="flex items-center gap-2">
          <Clock size={14} className="text-primary" />
          {format(date, 'h:mm a')}
        </span>
        <span className="flex items-center gap-2">
          <Users size={14} className="text-primary" />
          {Array.isArray(meeting.participants) ? meeting.participants.length : (meeting.participants || 0)} participants
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        {isJoined ? (
          <Button
            className="flex-1 gap-2 bg-red-500 hover:bg-red-600"
            onClick={() => onJoin(meeting._id || meeting.roomId)}
          >
            <PhoneOff size={16} /> Leave Meeting
          </Button>
        ) : (
          <>
            <Button
              className="flex-1 gap-2 bg-primary hover:bg-primary/90"
              onClick={() => onJoin(meeting._id || meeting.roomId)}
            >
              <Phone size={16} /> Join Now
            </Button>
            <Link to={`/meeting/${meeting.roomId || meeting._id}`}>
              <Button variant="outline" className="gap-2">
                <ArrowRight size={14} />
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function OngoingMeetingsPage() {
  const { ongoingMeetings } = useMeetings()
  const [joinedMeetingId, setJoinedMeetingId] = useState(null)

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
    <div className="p-8 space-y-7 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20 border border-primary/40">
              <Zap size={20} className="text-primary animate-pulse" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">Today's Meetings</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {sortedOngoingMeetings.length === 0
              ? 'No meetings scheduled for today'
              : `${sortedOngoingMeetings.length} meeting${sortedOngoingMeetings.length > 1 ? 's' : ''} scheduled today`}
          </p>
        </div>
        <Link to="/create-meeting">
          <Button className="gap-2">
            <Plus size={16} /> New Meeting
          </Button>
        </Link>
      </div>

      {/* Ongoing meetings grid */}
      {sortedOngoingMeetings.length === 0 ? (
        <div className="text-center py-20 bg-card border-2 border-dashed border-border rounded-xl">
          <Zap size={48} className="text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground font-body text-lg mb-2">No meetings scheduled for today</p>
          <p className="text-muted-foreground text-sm mb-6">
            When anyone schedules a meeting for today, it will appear here
          </p>
          <Link to="/create-meeting">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus size={14} /> Schedule a meeting
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sortedOngoingMeetings.map((meeting, i) => (
            <div
              key={meeting._id || meeting.roomId}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <OngoingMeetingCard
                meeting={meeting}
                onJoin={handleJoinMeeting}
                joinedMeetingId={joinedMeetingId}
              />
            </div>
          ))}
        </div>
      )}

      {/* Info section */}
      {sortedOngoingMeetings.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mt-8">
          <div className="flex gap-3">
            <Zap size={20} className="text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display font-semibold text-foreground mb-1">Today's Scheduled Meetings</h3>
              <p className="text-sm text-muted-foreground">
                Click "Join Now" to enter the meeting room instantly. You can also view more details by clicking the arrow button. Meetings are displayed in chronological order.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
