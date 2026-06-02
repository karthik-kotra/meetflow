import { useState, useRef, useEffect } from 'react'
import { Search, Send, Circle, MessageSquare, Smile, Sparkles, X } from 'lucide-react'
import { useChat } from '@/context/ChatContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { format, isToday, isYesterday } from 'date-fns'

function formatTime(ts) {
  const d = new Date(ts)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function getInitials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

const renderTextWithMentions = (text, contactsList = []) => {
  if (!text) return '';
  if (!contactsList || contactsList.length === 0) {
    const parts = text.split(/(@\w+(?:\s\w+)?)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="bg-primary/20 text-primary font-bold px-1 py-0.5 rounded">{part}</span>;
      }
      return part;
    });
  }
  // Sort contacts by name length descending
  const sortedContacts = [...contactsList].sort((a, b) => b.name.length - a.name.length);
  
  let result = [text];
  for (const contact of sortedContacts) {
    const name = contact.name;
    if (!name) continue;
    const mentionStr = `@${name}`;
    const newResult = [];
    for (const item of result) {
      if (typeof item !== 'string') {
        newResult.push(item);
        continue;
      }
      const parts = item.split(new RegExp(`(${mentionStr})`, 'gi'));
      newResult.push(...parts.map((p, idx) => {
        if (p.toLowerCase() === mentionStr.toLowerCase()) {
          return <span key={`${contact.id || idx}-${idx}`} className="bg-primary/25 text-primary font-bold px-1.5 py-0.5 rounded-md border border-primary/20">{p}</span>;
        }
        return p;
      }));
    }
    result = newResult;
  }
  return result;
};

function ContactRow({ contact, isActive, lastMessage, onClick, currentUser }) {
  const preview = lastMessage
    ? lastMessage.senderId === currentUser?.id
      ? `You: ${lastMessage.text}`
      : lastMessage.text
    : 'No messages yet'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-150 group',
        isActive
          ? 'bg-primary/15 border border-primary/25'
          : 'hover:bg-secondary/60 border border-transparent'
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback
            className={cn(
              'text-xs font-display font-semibold',
              isActive ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
            )}
          >
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        {contact.online && (
          <span className={cn(
            "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background",
            contact.status === 'online' && 'bg-emerald-400',
            contact.status === 'away' && 'bg-amber-400',
            contact.status === 'in-meeting' && 'bg-violet-500',
            contact.status === 'offline' && 'bg-muted-foreground'
          )} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={cn('text-sm font-display font-semibold truncate', isActive ? 'text-primary' : 'text-foreground')}>
            {contact.name}
          </p>
          {lastMessage && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatTime(lastMessage.createdAt || lastMessage.ts)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">{preview}</p>
          {contact.unreadCount > 0 && !isActive && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 animate-bounce">
              {contact.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function ChatBubble({ msg, isMe, senderName, contactsList }) {
  return (
    <div className={cn('flex items-end gap-2 group', isMe ? 'flex-row-reverse' : 'flex-row')}>
      {!isMe && (
        <Avatar className="h-7 w-7 shrink-0 mb-1">
          <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
            {getInitials(senderName)}
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          'max-w-[72%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed relative',
          isMe
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-card border border-border text-foreground rounded-bl-sm'
        )}
      >
        {renderTextWithMentions(msg.text, contactsList)}
        <span
          title={format(new Date(msg.createdAt || msg.ts), 'PPPP, h:mm:ss a')}
          className={cn(
            'text-[10px] block mt-1 opacity-60 leading-none cursor-help select-none selection:bg-transparent',
            isMe ? 'text-right' : 'text-left'
          )}
        >
          {format(new Date(msg.createdAt || msg.ts), 'h:mm a')}
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <MessageSquare size={28} className="text-primary opacity-70" />
      </div>
      <div>
        <p className="font-display font-semibold text-foreground text-lg">Your messages</p>
        <p className="text-muted-foreground text-sm mt-1">
          Select a contact to start chatting, or pick up where you left off.
        </p>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { 
    contacts, 
    activeContactId, 
    setActiveContactId, 
    getMessages, 
    sendMessage, 
    getLastMessage, 
    currentUser,
    typingUsers,
    sendTyping
  } = useChat()
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Autocomplete & Emojis
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const activeContact = contacts.find((c) => c.id === activeContactId)
  const msgs = activeContactId ? getMessages(activeContactId) : []
  const [chatSummary, setChatSummary] = useState("")
  const [summarizing, setSummarizing] = useState(false)

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.role.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  useEffect(() => {
    if (activeContactId) inputRef.current?.focus()
  }, [activeContactId])

  // Stop typing on active chat change or unmount
  useEffect(() => {
    setChatSummary("")
    setSummarizing(false)
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [activeContactId])

  const handleInputChange = (e) => {
    const text = e.target.value
    setDraft(text)

    if (!activeContactId) return

    // Notify backend typing has started
    sendTyping(activeContactId, true)

    // Debounce the stop_typing event
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(activeContactId, false)
    }, 2000)

    // Autocomplete triggers
    const match = text.match(/(?:^|\s)@(\w*)$/)
    if (match) {
      setShowMentionDropdown(true)
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setShowMentionDropdown(false)
    }
  }

  const insertMention = (contactName) => {
    const cursorIndex = draft.lastIndexOf('@')
    if (cursorIndex === -1) return
    const beforeMention = draft.substring(0, cursorIndex)
    const completedText = `${beforeMention}@${contactName} `
    setDraft(completedText)
    setShowMentionDropdown(false)
  }

  const filteredContactsForMention = contacts.filter(c => {
    if (c.id === currentUser?.id) return false
    return c.name.toLowerCase().includes(mentionQuery.toLowerCase())
  })

  const handleSend = () => {
    const text = draft.trim()
    if (!text || !activeContactId) return
    sendMessage(activeContactId, text)
    
    // Reset typing status immediately
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    sendTyping(activeContactId, false)
    
    setDraft('')
    setShowMentionDropdown(false)
  }

  const handleSummarize = async () => {
    if (!activeContactId) return
    setSummarizing(true)
    try {
      const res = await fetch(`/api/chat/${activeContactId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (res.ok) {
        const data = await res.json()
        setChatSummary(data.summary)
      } else {
        alert("Failed to summarize chat history.")
      }
    } catch (err) {
      console.error("Error summarizing chat:", err)
      alert("Failed to summarize chat history.")
    } finally {
      setSummarizing(false)
    }
  }

  const handleKeyDown = (e) => {
    if (showMentionDropdown && filteredContactsForMention.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(prev => (prev + 1) % filteredContactsForMention.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(prev => (prev - 1 + filteredContactsForMention.length) % filteredContactsForMention.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredContactsForMention[mentionIndex].name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionDropdown(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const renderMessages = () => {
    if (msgs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-center my-auto">
          <p className="text-muted-foreground text-sm">No messages yet. Say hello! 👋</p>
        </div>
      )
    }

    const elements = []
    let lastDateLabel = null

    msgs.forEach((msg, idx) => {
      const msgDate = new Date(msg.createdAt || msg.ts)
      let dateLabel = ''
      
      if (isToday(msgDate)) {
        dateLabel = 'Today'
      } else if (isYesterday(msgDate)) {
        dateLabel = 'Yesterday'
      } else {
        dateLabel = format(msgDate, 'MMMM d, yyyy')
      }

      if (dateLabel !== lastDateLabel) {
        elements.push(
          <div key={`date-sep-${dateLabel}-${idx}`} className="flex items-center justify-center my-6 animate-fade-in">
            <div className="h-[1px] bg-border flex-grow" />
            <span className="text-[10px] tracking-wider uppercase text-muted-foreground font-display font-bold px-3 py-1 bg-secondary/80 rounded-full border border-border">
              {dateLabel}
            </span>
            <div className="h-[1px] bg-border flex-grow" />
          </div>
        )
        lastDateLabel = dateLabel
      }

      elements.push(
        <ChatBubble
          key={msg._id || msg.id}
          msg={msg}
          isMe={msg.senderId === currentUser.id}
          senderName={activeContact.name}
          contactsList={contacts}
        />
      )
    })

    return elements
  }

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Sidebar panel */}
      <aside className="w-80 shrink-0 flex flex-col border-r border-border bg-card/50">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-border">
          <h1 className="font-display text-xl font-bold text-foreground">Messages</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {contacts.filter((c) => c.online).length} teammates online
          </p>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search teammates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm bg-secondary border-transparent focus-visible:border-primary/40"
            />
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No contacts found</p>
          ) : (
            filtered.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                isActive={contact.id === activeContactId}
                lastMessage={getLastMessage(contact.id)}
                onClick={() => setActiveContactId(contact.id)}
                currentUser={currentUser}
              />
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeContact ? (
          <EmptyState />
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/30 shrink-0">
              <div className="relative">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs font-display font-semibold bg-primary/15 text-primary">
                    {getInitials(activeContact.name)}
                  </AvatarFallback>
                </Avatar>
                {activeContact.online && (
                  <span className={cn(
                    "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background",
                    activeContact.status === 'online' && 'bg-emerald-400',
                    activeContact.status === 'away' && 'bg-amber-400',
                    activeContact.status === 'in-meeting' && 'bg-violet-500',
                    activeContact.status === 'offline' && 'bg-muted-foreground'
                  )} />
                )}
              </div>
              <div>
                <p className="font-display font-semibold text-sm text-foreground">{activeContact.name}</p>
                <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  {activeContact.online ? (
                    <>
                      <Circle 
                        size={7} 
                        className={cn(
                          "fill-current border-none",
                          activeContact.status === 'online' && 'text-emerald-400',
                          activeContact.status === 'away' && 'text-amber-400',
                          activeContact.status === 'in-meeting' && 'text-violet-500',
                          activeContact.status === 'offline' && 'text-muted-foreground'
                        )} 
                      />
                      <span className="capitalize">{activeContact.status}</span> · {activeContact.role}
                    </>
                  ) : (
                    <>{activeContact.role} · Offline</>
                  )}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {renderMessages()}
              
              {/* Typing indicator bubble */}
              {typingUsers[activeContactId] && (
                <div className="flex items-end gap-2 animate-fade-in">
                  <Avatar className="h-7 w-7 shrink-0 mb-1">
                    <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
                      {getInitials(activeContact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce duration-300" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce duration-300" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce duration-300" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="px-6 py-4 border-t border-border bg-card/30 shrink-0 relative">
              {/* Mention Autocomplete Dropdown */}
              {showMentionDropdown && filteredContactsForMention.length > 0 && (
                <div className="absolute bottom-full left-6 mb-2 bg-card border border-border rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto p-1.5 z-40 animate-fade-in backdrop-blur-md">
                  <div className="px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground font-bold font-display border-b border-border/40">Teammates to mention</div>
                  {filteredContactsForMention.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => insertMention(c.name)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-left transition-colors",
                        idx === mentionIndex
                          ? "bg-primary/15 text-primary"
                          : "text-foreground hover:bg-secondary/60"
                      )}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[8px] bg-secondary text-primary font-display font-bold">
                          {getInitials(c.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Emoji Picker Panel */}
              {showEmojiPicker && (
                <div className="absolute bottom-full right-6 mb-2 bg-card border border-border rounded-xl shadow-xl p-2.5 z-40 animate-fade-in grid grid-cols-5 gap-1.5 w-44 backdrop-blur-md">
                  {['👍', '❤️', '🔥', '😂', '🚀', '🎉', '👀', '💡', '💯', '✨'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setDraft(prev => prev + emoji);
                        setShowEmojiPicker(false);
                      }}
                      className="w-7 h-7 text-sm flex items-center justify-center rounded-lg hover:bg-secondary transition-all"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {chatSummary && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl relative animate-fade-in text-xs text-foreground leading-relaxed shadow-sm mb-3">
                  <button
                    type="button"
                    onClick={() => setChatSummary("")}
                    className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    title="Close Summary"
                  >
                    <X size={12} />
                  </button>
                  <div className="flex items-center gap-1.5 font-display font-extrabold text-[10px] text-primary uppercase tracking-wider mb-1">
                    <Sparkles size={11} className="text-primary animate-pulse" /> Chat Summary
                  </div>
                  <p className="pr-4 font-medium select-text">{chatSummary}</p>
                </div>
              )}

              <div className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-2 border border-border focus-within:border-primary/40 transition-colors">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${activeContact.name}…`}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={cn(
                    "text-muted-foreground hover:text-primary transition-colors pr-1",
                    showEmojiPicker && "text-primary"
                  )}
                  title="Add emoji"
                >
                  <Smile size={17} />
                </button>
                <button
                  type="button"
                  onClick={handleSummarize}
                  disabled={summarizing}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg border border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 transition-all duration-150 shrink-0 mr-1',
                    summarizing && 'opacity-60 cursor-not-allowed'
                  )}
                  title="Summarize Chat Messages"
                >
                  {summarizing ? (
                    <svg className="animate-spin h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <Sparkles size={15} />
                  )}
                </button>
                <button
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150',
                    draft.trim()
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                      : 'bg-transparent text-muted-foreground cursor-not-allowed opacity-40'
                  )}
                >
                  <Send size={15} />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Press <kbd className="px-1 py-0.5 rounded bg-secondary border border-border font-mono">Enter</kbd> to send
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
