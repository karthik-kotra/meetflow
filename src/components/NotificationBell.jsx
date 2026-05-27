import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, Trash2, BellOff, CheckSquare, MessageSquare, Video, ShieldAlert } from 'lucide-react'
import { useNotifications } from '@/context/NotificationContext'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow, parseISO } from 'date-fns'

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef(null)
  const navigate = useNavigate()

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = async (n) => {
    await markAsRead(n._id)
    setIsOpen(false)

    // Routing based on relatedModel
    if (n.relatedModel === 'WorkspaceTask' && n.relatedId) {
      navigate('/workspaces') // Redirect to workspaces dashboard where tasks live
    } else if (n.relatedModel === 'Meeting' && n.relatedId) {
      navigate(`/meeting/${n.relatedId}`)
    } else if (n.relatedModel === 'Workspace' && n.relatedId) {
      navigate(`/workspace/${n.relatedId}`)
    }
  }

  // Type helper for icons and styling
  const getTypeConfig = (type) => {
    switch (type) {
      case 'task_assigned':
        return { icon: CheckSquare, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' }
      case 'mention':
        return { icon: MessageSquare, color: 'text-primary bg-primary/10 border-primary/20' }
      case 'meeting_invite':
        return { icon: Video, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }
      default:
        return { icon: ShieldAlert, color: 'text-muted-foreground bg-secondary border-border' }
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative h-9 w-9 rounded-lg transition-all ${
          isOpen ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
        }`}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[8px] font-extrabold h-4.5 w-4.5 rounded-full flex items-center justify-center border-2 border-card animate-pulse shadow-sm">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Premium Floating Drawer Popover */}
      {isOpen && (
        <div className="absolute left-14 -top-2 w-80 bg-card border border-border shadow-2xl rounded-xl z-50 flex flex-col max-h-[420px] overflow-hidden animate-fade-in noise-bg glow-primary">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-border bg-secondary/20">
            <span className="text-xs font-display font-bold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] font-display font-semibold text-primary hover:underline transition-all cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/60 max-h-[320px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center gap-2">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center border border-border">
                  <BellOff size={18} className="text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-foreground mt-1">All caught up!</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">No new alerts or task assignments logged.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = getTypeConfig(n.type)
                const Icon = config.icon
                const dateVal = n.createdAt ? parseISO(n.createdAt) : new Date()

                return (
                  <div
                    key={n._id}
                    className={`flex gap-3 p-3 transition-colors select-none ${
                      n.read ? 'bg-transparent hover:bg-secondary/20' : 'bg-primary/5 hover:bg-primary/10'
                    }`}
                  >
                    {/* Icon tag */}
                    <div className={`h-8 w-8 rounded-lg border shrink-0 flex items-center justify-center ${config.color}`}>
                      <Icon size={14} />
                    </div>

                    {/* Content */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleNotificationClick(n)}
                    >
                      <p className={`text-xs truncate font-display ${n.read ? 'text-foreground/90 font-medium' : 'text-foreground font-bold'}`}>
                        {n.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-normal mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                      <span className="text-[9px] text-muted-foreground/80 font-medium mt-1.5 block">
                        {formatDistanceToNow(dateVal, { addSuffix: true })}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col justify-between items-end gap-2 shrink-0">
                      {!n.read && (
                        <button
                          onClick={() => markAsRead(n._id)}
                          className="text-primary hover:scale-110 active:scale-95 transition-all"
                          title="Mark as read"
                        >
                          <Check size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(n._id)}
                        className="text-muted-foreground hover:text-destructive hover:scale-110 active:scale-95 transition-all"
                        title="Delete notification"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
