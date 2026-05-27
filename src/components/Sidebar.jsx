import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  User,
  LogOut,
  Video,
  ChevronRight,
  MessageSquare,
  Briefcase,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import NotificationBell from '@/components/NotificationBell'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspaces', label: 'Workspaces', icon: Briefcase },
  { to: '/meetings', label: 'Meetings', icon: CalendarDays },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { totalUnreadCount, myStatus, updateStatus } = useChat() || {}
  const { workspaces } = useWorkspace() || { workspaces: [] }
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <aside className="flex flex-col w-64 h-screen bg-card border-r border-border fixed left-0 top-0 z-40">
      {/* Logo & Notification Bell */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/15 border border-primary/30">
            <Video className="w-4.5 h-4.5 text-primary" size={18} />
          </div>
          <span className="font-display font-700 text-lg tracking-tight text-foreground">
            Meet<span className="text-primary">Flow</span>
          </span>
        </div>
        <NotificationBell />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-display font-semibold tracking-widest text-muted-foreground uppercase px-3 mb-3">
          Navigation
        </p>
        {navItems.map(({ to, label, icon: Icon }) => (
          <div key={to}>
            <NavLink to={to}>
              {({ isActive }) => (
                <div
                  className={cn(
                    'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all duration-150 cursor-pointer',
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/25'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon
                    size={17}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  <span className="flex-1">{label}</span>
                  {label === 'Chat' && totalUnreadCount > 0 && (
                    <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse mr-2">
                      {totalUnreadCount}
                    </span>
                  )}
                  {isActive && (
                    <ChevronRight size={14} className="text-primary opacity-70" />
                  )}
                </div>
              )}
            </NavLink>

            {/* Nested Workspaces sub-list */}
            {label === 'Workspaces' && workspaces?.length > 0 && (
              <div className="pl-6 pr-3 mt-1.5 space-y-1 animate-fade-in border-l border-border/60 ml-5">
                {workspaces.map((ws) => (
                  <NavLink
                    key={ws._id}
                    to={`/workspace/${ws._id}`}
                    className={({ isActive }) => cn(
                      "flex items-center gap-2 py-1.5 px-2 rounded-md text-xs transition-colors truncate font-body block",
                      isActive
                        ? "text-primary bg-primary/5 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-[10px]">💼</span>
                    <span className="truncate">{ws.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom: user + logout */}
      <div className="px-3 py-4 border-t border-border space-y-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/60 relative">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
              myStatus === 'online' && 'bg-emerald-400',
              myStatus === 'away' && 'bg-amber-400',
              myStatus === 'in-meeting' && 'bg-violet-500',
              myStatus === 'offline' && 'bg-muted-foreground'
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        {/* Status Selector */}
        <div className="px-3 flex items-center justify-between gap-2 bg-secondary/30 rounded-lg py-2 border border-border/40">
          <span className="text-[11px] text-muted-foreground font-display font-medium">Status:</span>
          <select
            value={myStatus || 'online'}
            onChange={(e) => updateStatus?.(e.target.value)}
            className="text-[11px] font-medium bg-transparent border-none text-foreground outline-none cursor-pointer rounded px-1.5 py-0.5 hover:bg-secondary/60 transition-colors"
          >
            <option value="online" className="bg-card">🟢 Online</option>
            <option value="away" className="bg-card">🟡 Away</option>
            <option value="in-meeting" className="bg-card">🟣 In Meeting</option>
            <option value="offline" className="bg-card">🔴 Offline</option>
          </select>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-3"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          Logout
        </Button>
      </div>
    </aside>
  )
}
