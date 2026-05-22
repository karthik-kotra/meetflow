import { createContext, useContext, useState, useMemo, useEffect } from 'react'
import { parseISO, isToday, isBefore, isAfter, startOfDay, endOfDay } from 'date-fns'

const MeetingsContext = createContext(null)

const STORAGE_KEY = 'meetflow_meetings'

// Initialize meetings from localStorage or empty array
const initializeMeetings = () => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Failed to load meetings from localStorage:', error)
    return []
  }
}

export function MeetingsProvider({ children }) {
  const [meetings, setMeetings] = useState(initializeMeetings)

  // Persist meetings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings))
    } catch (error) {
      console.error('Failed to save meetings to localStorage:', error)
    }
  }, [meetings])

  const createMeeting = (data) => {
    const newMeeting = {
      id: Date.now().toString(),
      ...data,
      status: 'upcoming',
      participants: 1,
      createdAt: new Date().toISOString(),
    }
    setMeetings((prev) => [newMeeting, ...prev])
    return newMeeting
  }

  const getMeeting = (id) => meetings.find((m) => m.id === id)

  const deleteMeeting = (id) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id))
  }

  // Get ongoing meetings (meetings scheduled for today)
  const getOngoingMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (m.status === 'completed') return false
      // Check if meeting date is today
      const meetingDate = parseISO(m.date)
      return isToday(meetingDate)
    })
  }, [meetings])

  // Get upcoming meetings (meetings scheduled for future dates)
  const getUpcomingMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (m.status === 'completed') return false
      const meetingDate = parseISO(m.date)
      const now = new Date()
      // Get start of today
      const todayStart = startOfDay(now)
      // Meeting is upcoming if it's after today
      return isAfter(meetingDate, todayStart) && !isToday(meetingDate)
    })
  }, [meetings])

  return (
    <MeetingsContext.Provider 
      value={{ 
        meetings, 
        createMeeting, 
        getMeeting, 
        deleteMeeting,
        ongoingMeetings: getOngoingMeetings,
        upcomingMeetings: getUpcomingMeetings
      }}
    >
      {children}
    </MeetingsContext.Provider>
  )
}

export const useMeetings = () => useContext(MeetingsContext)
