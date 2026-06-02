import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Clock, FileText, Type, CheckCircle2, Lock, Users, Briefcase } from 'lucide-react'
import { useMeetings } from '@/context/MeetingsContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function CreateMeetingPage() {
  const { createMeeting } = useMeetings()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    isPrivate: false,
  })
  const [errors, setErrors] = useState({})
  const [users, setUsers] = useState([])
  const [invitedUsers, setInvitedUsers] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch('/api/users')
        if (res.ok) {
          const data = await res.json()
          setUsers(data)
        }
      } catch (err) {
        console.error('Failed to load users for invitation:', err)
      }
    }
    const loadWorkspaces = async () => {
      try {
        const res = await fetch('/api/workspaces')
        if (res.ok) {
          const data = await res.json()
          setWorkspaces(data)
        }
      } catch (err) {
        console.error('Failed to load workspaces:', err)
      }
    }
    loadUsers()
    loadWorkspaces()
  }, [])

  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = 'Meeting title is required.'
    if (!form.date) e.date = 'Please select a date.'
    if (!form.time) e.time = 'Please select a time.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    const meeting = await createMeeting({
      ...form,
      participants: form.isPrivate ? invitedUsers : [],
      workspaceId: selectedWorkspace || null
    })
    setLoading(false)
    if (meeting) {
      setSuccess(true)
      await new Promise((r) => setTimeout(r, 1200))
      
      const meetingDateTime = new Date(`${form.date}T${form.time}`)
      const isFuture = meetingDateTime > new Date()
      
      if (isFuture) {
        navigate('/meetings?filter=upcoming')
      } else {
        navigate(`/meeting/${meeting.roomId}`)
      }
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const today = new Date().toISOString().split('T')[0]
  const meetingDateTime = form.date && form.time ? new Date(`${form.date}T${form.time}`) : null
  const isFuture = meetingDateTime ? meetingDateTime > new Date() : false

  if (success) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/15 border border-primary/30 mb-4">
          <CheckCircle2 size={36} className="text-primary" />
        </div>
        <h2 className="font-display font-bold text-2xl text-foreground">Meeting created!</h2>
        <p className="text-muted-foreground mt-1.5">
          {isFuture ? 'Redirecting to scheduled upcoming meetings…' : 'Redirecting to meeting room…'}
        </p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-foreground">Create Meeting</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fill in the details below to schedule a new meeting.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2 text-sm">
            <FileText size={15} className="text-primary" />
            Meeting Details
          </h2>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Meeting Title</Label>
            <div className="relative">
              <Type size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="title"
                placeholder="e.g. Q3 Product Review"
                className="pl-9"
                value={form.title}
                onChange={set('title')}
              />
            </div>
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description{' '}
              <span className="normal-case text-muted-foreground/60 font-normal tracking-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="description"
              placeholder="What will this meeting cover? Add agenda items, goals, or context…"
              className="min-h-[120px]"
              value={form.description}
              onChange={set('description')}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2 text-sm">
            <CalendarDays size={15} className="text-primary" />
            Schedule
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="date"
                  type="date"
                  min={today}
                  className="pl-9"
                  value={form.date}
                  onChange={set('date')}
                />
              </div>
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>

            {/* Time */}
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <div className="relative">
                <Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="time"
                  type="time"
                  className="pl-9"
                  value={form.time}
                  onChange={set('time')}
                />
              </div>
              {errors.time && <p className="text-xs text-destructive">{errors.time}</p>}
            </div>
          </div>
        </div>

        {/* Room Privacy Option */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2 text-sm">
            <Lock size={15} className="text-primary" />
            Privacy Options
          </h2>
          <div className="flex items-center space-x-3 p-4 bg-secondary/15 rounded-xl border border-border/40 hover:border-border transition-all">
            <input
              id="isPrivate"
              type="checkbox"
              className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary accent-primary cursor-pointer"
              checked={form.isPrivate}
              onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
            />
            <div className="space-y-0.5 cursor-pointer select-none flex-1" onClick={() => setForm({ ...form, isPrivate: !form.isPrivate })}>
              <Label htmlFor="isPrivate" className="text-sm font-semibold text-foreground cursor-pointer">Private Meeting Room</Label>
              <p className="text-xs text-muted-foreground mt-0.5">If checked, only invited users can access and join this meeting room.</p>
            </div>
          </div>
        </div>

        {/* Workspace Association */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5 animate-fade-in">
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2 text-sm">
            <Briefcase size={15} className="text-primary" />
            Workspace Association (Optional)
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="workspace">Select Workspace</Label>
            <select
              id="workspace"
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="">None (Personal / Public Meeting)</option>
              {workspaces.map(w => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Associate this meeting with a workspace to include it in the workspace's analytics.</p>
          </div>
        </div>

        {/* Invite Users when meeting is Private */}
        {form.isPrivate && users.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="font-display font-semibold text-foreground flex items-center gap-2 text-sm">
                <Users size={15} className="text-primary" />
                Invite Members
              </h2>
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full border border-primary/25">
                {invitedUsers.length} selected
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Select team members to invite to this private meeting.</p>
            <div className="max-h-48 overflow-y-auto border border-border/40 rounded-xl p-3 bg-secondary/15 space-y-2.5 custom-scrollbar">
              {users.map((u) => {
                const isSelected = invitedUsers.includes(u._id);
                return (
                  <div
                    key={u._id}
                    onClick={() => {
                      if (isSelected) {
                        setInvitedUsers(invitedUsers.filter(id => id !== u._id))
                      } else {
                        setInvitedUsers([...invitedUsers, u._id])
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30 shadow-sm'
                        : 'bg-card/50 border-transparent hover:bg-secondary/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary select-none shrink-0">
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-semibold text-foreground leading-none">{u.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-none">{u.email}</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary accent-primary cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Preview card */}
        {(form.title || form.date) && (
          <div className="bg-primary/5 border border-primary/25 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between items-center">
              <p className="text-xs font-display font-semibold text-primary uppercase tracking-wide">Preview</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${form.isPrivate ? 'bg-amber-500/10 text-amber-500 border-amber-500/25' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'}`}>
                {form.isPrivate ? 'Private' : 'Public'}
              </span>
            </div>
            <p className="font-display font-semibold text-foreground">{form.title || 'Untitled Meeting'}</p>
            {form.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{form.description}</p>
            )}
            <div className="flex gap-3 text-xs text-muted-foreground pt-1">
              {form.date && (
                <span className="flex items-center gap-1"><CalendarDays size={11} />{form.date}</span>
              )}
              {form.time && (
                <span className="flex items-center gap-1"><Clock size={11} />{form.time}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none sm:px-8"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none sm:px-8" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scheduling…
              </span>
            ) : (
              'Schedule Meeting'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
