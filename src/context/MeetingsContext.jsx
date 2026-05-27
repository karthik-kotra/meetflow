import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react'
import { parseISO, isToday, isAfter, startOfDay } from 'date-fns'
import { useAuth } from '@/context/AuthContext'

const MeetingsContext = createContext(null)

export function MeetingsProvider({ children }) {
  const { user } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(false)

  // Fetch all meetings from backend
  const fetchMeetings = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await fetch('/api/meetings')
      if (res.ok) {
        const data = await res.json()
        setMeetings(data)
      }
    } catch (error) {
      console.error('Failed to load meetings from backend:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Load meetings when authenticated user is present
  useEffect(() => {
    if (user) {
      fetchMeetings()
    } else {
      setMeetings([])
    }
  }, [user, fetchMeetings])

  const createMeeting = async (data) => {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const newMeeting = await res.json()
        setMeetings((prev) => [newMeeting, ...prev])
        return newMeeting
      }
    } catch (error) {
      console.error('Failed to create meeting:', error)
    }
    return null
  }

  // Find a meeting locally by _id or roomId
  const getMeeting = (id) => {
    return meetings.find((m) => m._id === id || m.roomId === id || m.id === id)
  }

  // Asynchronously fetch details from database by ID or Room ID
  const fetchMeetingDetails = async (id) => {
    try {
      const res = await fetch(`/api/meetings/${id}`)
      if (res.ok) {
        return await res.json()
      }
    } catch (error) {
      console.error('Failed to fetch meeting details:', error)
    }
    return null
  }

  const deleteMeeting = async (id) => {
    if (!id) return
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'DELETE',
      })
      // Always remove it from local state to ensure the UI updates, even if it's a mock or stale item
      setMeetings((prev) => prev.filter((m) => m._id !== id && m.id !== id))
    } catch (error) {
      console.error('Failed to delete meeting:', error)
      // Fallback
      setMeetings((prev) => prev.filter((m) => m._id !== id && m.id !== id))
    }
  }

  // Get ongoing meetings (meetings scheduled for today)
  const getOngoingMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (m.status === 'completed') return false
      if (!m.date) return false
      // Check if meeting date is today
      try {
        const meetingDate = parseISO(m.date)
        return isToday(meetingDate)
      } catch (e) {
        return false
      }
    })
  }, [meetings])

  // Get upcoming meetings (meetings scheduled for future dates)
  const getUpcomingMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (m.status === 'completed') return false
      if (!m.date) return false
      try {
        const meetingDate = parseISO(m.date)
        const now = new Date()
        const todayStart = startOfDay(now)
        return isAfter(meetingDate, todayStart) && !isToday(meetingDate)
      } catch (e) {
        return false
      }
    })
  }, [meetings])

  const updateMeetingStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/meetings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const updated = await res.json()
        setMeetings((prev) => prev.map((m) => m._id === id || m.roomId === id ? updated : m))
        return updated
      }
    } catch (error) {
      console.error('Failed to update meeting status:', error)
    }
    return null
  }

  return (
    <MeetingsContext.Provider 
      value={{ 
        meetings, 
        loading,
        fetchMeetings,
        createMeeting, 
        getMeeting, 
        fetchMeetingDetails,
        deleteMeeting,
        updateMeetingStatus,
        ongoingMeetings: getOngoingMeetings,
        upcomingMeetings: getUpcomingMeetings
      }}
    >
      {children}
    </MeetingsContext.Provider>
  )
}

export const useMeetings = () => useContext(MeetingsContext)
