import { createContext, useContext, useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '@/context/AuthContext'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch notifications from database
  const fetchNotifications = async () => {
    if (!user) return
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data)
        setUnreadCount(data.filter((n) => !n.read).length)
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    }
  }

  useEffect(() => {
    if (user) {
      fetchNotifications()

      const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
        withCredentials: true
      })

      // Register online
      socket.emit('register_user', user.id)

      // Listen for incoming notifications in real-time
      socket.on('new_notification', (notification) => {
        setNotifications((prev) => [notification, ...prev])
        setUnreadCount((c) => c + 1)
        
        // Push HTML5 Web Toast Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(notification.title, {
              body: notification.message,
              icon: '/favicon.ico'
            })
          } catch (e) {
            console.warn('Web Notification display failed:', e)
          }
        }
      })

      return () => {
        socket.disconnect()
      }
    } else {
      setNotifications([])
      setUnreadCount(0)
    }
    // eslint-disable-next-line
  }, [user])

  // Request browser permission for OS-level notifications
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const markAsRead = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH'
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, read: true } : n))
        setUnreadCount((c) => Math.max(0, c - 1))
      }
    } catch (err) {
      console.error('Failed to mark read:', err)
    }
  }

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PATCH'
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnreadCount(0)
      }
    } catch (err) {
      console.error('Failed to mark all read:', err)
    }
  }

  const deleteNotification = async (id) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n._id !== id))
        setUnreadCount((prev) => {
          const wasUnread = notifications.find((n) => n._id === id && !n.read)
          return wasUnread ? Math.max(0, prev - 1) : prev
        })
      }
    } catch (err) {
      console.error('Failed to delete notification:', err)
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
