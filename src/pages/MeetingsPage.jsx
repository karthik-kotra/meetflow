import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Clock, Users, Plus, Search, Video, ArrowRight, Trash2 } from 'lucide-react'
import { useMeetings } from '@/context/MeetingsContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'

export default function MeetingsPage() {
  const { meetings, deleteMeeting } = useMeetings()
  const [search, setSearch] = useState('')
  
  const location = useLocation()
  const queryParams = new URLSearchParams(location.search)
  const initialFilter = queryParams.get('filter') || 'all'
  const [filter, setFilter] = useState(initialFilter)

  // Sync state when query parameter changes
  useEffect(() => {
    const newFilter = new URLSearchParams(location.search).get('filter') || 'all'
    setFilter(newFilter)
  }, [location.search])

  const filtered = meetings.filter((m) => {
    const title = m.title || ''
    const description = m.description || ''
    const matchSearch =
      title.toLowerCase().includes(search.toLowerCase()) ||
      description.toLowerCase().includes(search.toLowerCase())
    
    let matchFilter = true
    if (filter === 'upcoming') {
      matchFilter = m.status === 'upcoming' || m.status === 'ongoing'
    } else if (filter === 'completed') {
      matchFilter = m.status === 'completed'
    }

    return matchSearch && matchFilter
  })

  return (
    <div className="p-8 space-y-7 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Meetings</h1>
          <p className="text-muted-foreground text-sm mt-1">{meetings.length} total meetings</p>
        </div>
        <Link to="/create-meeting">
          <Button className="gap-2">
            <Plus size={16} /> New Meeting
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search meetings…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'upcoming', 'completed'].map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* Meeting grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-dashed border-border rounded-xl">
          <CalendarDays size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground font-body">No meetings found.</p>
          <Link to="/create-meeting">
            <Button variant="outline" size="sm" className="mt-4 gap-2">
              <Plus size={14} /> Create one
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((meeting, i) => {
            let dateLabel = 'Invalid Date'
            try {
              if (meeting.date && meeting.time) {
                const parsedDate = parseISO(`${meeting.date}T${meeting.time}`)
                dateLabel = format(parsedDate, 'MMM d, yyyy')
              }
            } catch (err) {
              console.error('Date parsing failed:', err)
            }
            const meetingId = meeting._id || meeting.roomId;
            return (
              <div
                key={meetingId}
                className="group bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-all duration-200 flex flex-col gap-4 animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-secondary border border-border shrink-0">
                    <Video size={17} className="text-primary" />
                  </div>
                  <Badge variant={meeting.status === 'completed' ? 'success' : 'default'} className="text-[10px]">
                    {meeting.status}
                  </Badge>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="font-display font-semibold text-foreground line-clamp-1">{meeting.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{meeting.description}</p>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-primary/60" />
                    {dateLabel}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-primary/60" />
                    {meeting.time}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={12} className="text-primary/60" />
                    {Array.isArray(meeting.participants) ? meeting.participants.length : (meeting.participants || 0)} participants
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-border">
                  <Link to={`/meeting/${meeting.roomId || meeting._id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                      Open <ArrowRight size={12} />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteMeeting(meeting._id || meeting.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
