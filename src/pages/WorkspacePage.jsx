import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { 
  Briefcase, MessageSquare, ListTodo, FileText, Users, 
  Plus, Send, Circle, Calendar, UserPlus, Trash2, ArrowRight,
  TrendingUp, CalendarDays, Clock, CheckCircle2, AlertCircle, ChevronRight,
  Download, Printer, BarChart2, Edit, Smile, Sparkles, X
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

function getInitials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

const renderTextWithMentions = (text, membersList = []) => {
  if (!text) return '';
  if (!membersList || membersList.length === 0) {
    const parts = text.split(/(@\w+(?:\s\w+)?)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="bg-primary/20 text-primary font-bold px-1 py-0.5 rounded">{part}</span>;
      }
      return part;
    });
  }
  // Sort members by name length descending so we match full names first
  const sortedMembers = [...membersList].sort((a, b) => {
    const nameA = a.name || a.user?.name || '';
    const nameB = b.name || b.user?.name || '';
    return nameB.length - nameA.length;
  });
  
  let result = [text];
  for (const member of sortedMembers) {
    const name = member.name || member.user?.name;
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
          return <span key={`${member._id || member.user?._id || idx}-${idx}`} className="bg-primary/25 text-primary font-bold px-1.5 py-0.5 rounded-md border border-primary/20">{p}</span>;
        }
        return p;
      }));
    }
    result = newResult;
  }
  return result;
};

export default function WorkspacePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeWorkspace,
    tasks,
    channelMessages,
    notes,
    createWorkspace,
    inviteMember,
    removeMember,
    fetchChannelMessages,
    sendChannelMessage,
    createTask,
    updateTask,
    deleteTask,
    editNotes,
    createChannel,
    editChannel,
    deleteChannel,
    typingUsers,
    sendWorkspaceTyping
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'board' | 'notes' | 'analytics' | 'members'
  const [activeChannelId, setActiveChannelId] = useState(null);
  
  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  const [showEditChannelModal, setShowEditChannelModal] = useState(false);
  const [editChannelId, setEditChannelId] = useState(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [editChannelDesc, setEditChannelDesc] = useState('');

  // Autocomplete & Emojis
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskColumn, setTaskColumn] = useState('todo');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const [chatDraft, setChatDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [channelSummary, setChannelSummary] = useState('');
  const [summarizingChannel, setSummarizingChannel] = useState(false);

  const messagesEndRef = useRef(null);

  // Sync route param with Workspace Context
  useEffect(() => {
    if (id) {
      setActiveWorkspaceId(id);
    } else {
      setActiveWorkspaceId(null);
    }
  }, [id, setActiveWorkspaceId]);

  // Set default active channel when activeWorkspace loads
  useEffect(() => {
    if (activeWorkspace && activeWorkspace.channels?.length > 0) {
      setActiveChannelId(activeWorkspace.channels[0]._id);
    }
  }, [activeWorkspace]);

  // Fetch messages when channel changes
  useEffect(() => {
    setChannelSummary('');
    setSummarizingChannel(false);
    if (activeWorkspaceId && activeChannelId) {
      fetchChannelMessages(activeChannelId);
    }
  }, [activeWorkspaceId, activeChannelId, fetchChannelMessages]);

  // Scroll to chat bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages, activeChannelId]);

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    const ws = await createWorkspace(newWsName, newWsDesc);
    if (ws) {
      setNewWsName('');
      setNewWsDesc('');
      setShowCreateModal(false);
      navigate(`/workspace/${ws._id}`);
    }
  };

  const typingTimeoutRef = useRef(null);

  const handleChatInputChange = (e) => {
    const text = e.target.value;
    setChatDraft(text);
    if (!activeChannelId) return;

    // Send typing notification
    sendWorkspaceTyping(activeChannelId, true);

    // Debounce stop typing
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendWorkspaceTyping(activeChannelId, false);
    }, 2000);

    // Autocomplete regex match for @mention
    const match = text.match(/(?:^|\s)@(\w*)$/);
    if (match) {
      setShowMentionDropdown(true);
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setShowMentionDropdown(false);
    }
  };

  const insertMention = (memberName) => {
    const cursorIndex = chatDraft.lastIndexOf('@');
    if (cursorIndex === -1) return;
    const beforeMention = chatDraft.substring(0, cursorIndex);
    const completedText = `${beforeMention}@${memberName} `;
    setChatDraft(completedText);
    setShowMentionDropdown(false);
  };

  const filteredMembers = activeWorkspace?.members?.filter(m => {
    if (!m.user) return false;
    if (m.user._id?.toString() === user?.id?.toString()) return false; // don't mention self
    return m.user.name.toLowerCase().includes(mentionQuery.toLowerCase());
  }) || [];

  const handleSendChat = () => {
    if (!chatDraft.trim() || !activeChannelId) return;
    sendChannelMessage(activeChannelId, chatDraft.trim());
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    sendWorkspaceTyping(activeChannelId, false);
    setChatDraft('');
    setShowMentionDropdown(false);
  };

  const handleSummarizeChannel = async () => {
    if (!activeWorkspaceId || !activeChannelId) return;
    setSummarizingChannel(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/channels/${activeChannelId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        setChannelSummary(data.summary);
      } else {
        alert("Failed to summarize channel chat history.");
      }
    } catch (err) {
      console.error("Error summarizing channel chat:", err);
      alert("Failed to summarize channel chat history.");
    } finally {
      setSummarizingChannel(false);
    }
  };

  const handleChatKeyDown = (e) => {
    if (showMentionDropdown && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex].user.name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    
    await createTask({
      title: taskTitle.trim(),
      description: taskDesc.trim(),
      status: taskColumn,
      priority: taskPriority,
      assigneeId: taskAssignee || null,
      dueDate: taskDueDate || null
    });

    setTaskTitle('');
    setTaskDesc('');
    setTaskPriority('medium');
    setTaskAssignee('');
    setTaskDueDate('');
    setShowTaskModal(false);
  };

  const handleMoveTask = async (taskId, newStatus) => {
    await updateTask(taskId, { status: newStatus });
  };

  const handleDeleteTask = async (taskId) => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(taskId);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const success = await inviteMember(inviteEmail.trim(), inviteRole);
    if (success) {
      setInviteEmail('');
      alert('Teammate successfully added to the workspace!');
    } else {
      alert('Could not find user or already member.');
    }
  };

  const handleRemoveUser = async (userId) => {
    if (confirm('Are you sure you want to remove this user from the workspace?')) {
      await removeMember(userId);
    }
  };

  const handleNotesChange = (e) => {
    setSavingNotes(true);
    editNotes(e.target.value);
    // Debounce save indicator
    setTimeout(() => {
      setSavingNotes(false);
    }, 1500);
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const ws = await createChannel(newChannelName.trim(), newChannelDesc.trim());
    if (ws) {
      const createdName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
      setNewChannelName('');
      setNewChannelDesc('');
      setShowChannelModal(false);
      
      const newlyCreatedChannel = ws.channels?.find(c => c.name === createdName);
      if (newlyCreatedChannel) {
        setActiveChannelId(newlyCreatedChannel._id);
      }
    }
  };

  // If no workspace is selected, show directory
  if (!id || !activeWorkspace) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
        {/* Header Dashboard section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground tracking-tight">Team Workspaces</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select or create an isolated, secure workspace to begin sprint tracking, channel messaging, and shared notes collaboration.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 shrink-0 h-11 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={16} />
            Create Workspace
          </Button>
        </div>

        {/* Quick analytics card block */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
              <Briefcase size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">{workspaces.length}</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Active Spaces</p>
            </div>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">
                {workspaces.reduce((acc, curr) => acc + (curr.members?.length || 0), 0)}
              </p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Total Members</p>
            </div>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold font-display text-foreground">100%</p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Real-time Sync Active</p>
            </div>
          </div>
        </div>

        {/* Directory Listing Grid */}
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-lg text-foreground">Your Workspaces Directory</h2>
          {workspaces.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center">
                <Briefcase size={24} className="text-primary opacity-80" />
              </div>
              <div>
                <p className="font-semibold text-foreground font-display text-base">No active workspaces</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 mx-auto">
                  You aren't a member of any workspaces yet. Create one or get invited by an administrator to start.
                </p>
              </div>
              <Button onClick={() => setShowCreateModal(true)} variant="outline" size="sm" className="mt-2">
                Create First Workspace
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workspaces.map((ws) => (
                <div 
                  key={ws._id}
                  onClick={() => navigate(`/workspace/${ws._id}`)}
                  className="bg-card border border-border/60 rounded-2xl p-6 hover:border-primary/40 shadow-sm transition-all duration-200 cursor-pointer group hover:-translate-y-0.5"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <h3 className="font-display font-bold text-base text-foreground group-hover:text-primary transition-colors">
                        {ws.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 pr-4">{ws.description || 'No description provided.'}</p>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <ChevronRight size={14} />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 mt-6 pt-4 border-t border-border/40 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users size={13} className="text-primary/70" />
                      <span>{ws.members?.length || 0} Members</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-primary/70" />
                      <span>{ws.channels?.length || 0} Channels</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Modal dialog */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="px-6 py-5 border-b border-border">
                <h3 className="font-display font-bold text-lg text-foreground">Create Workspace</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Spin up a secure room with channels, Kanban boards, and collaborative documents.</p>
              </div>
              <form onSubmit={handleCreateWorkspace} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="ws-name" className="text-xs font-semibold text-muted-foreground font-display">Workspace Name</label>
                  <Input 
                    id="ws-name"
                    required
                    placeholder="e.g. Frontend Team" 
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ws-desc" className="text-xs font-semibold text-muted-foreground font-display">Description</label>
                  <textarea 
                    id="ws-desc"
                    rows={3}
                    placeholder="Briefly state the goal of this workspace..." 
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                    value={newWsDesc}
                    onChange={(e) => setNewWsDesc(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Create Space
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Workspace Dashboard Area
  const activeChannel = activeWorkspace.channels?.find(c => c._id === activeChannelId);
  const currentMessages = activeChannelId ? (channelMessages[activeChannelId] || []) : [];
  const currentMemberRecord = activeWorkspace.members?.find(m => m.user?._id?.toString() === user?.id?.toString());
  const isAdmin = currentMemberRecord?.role === 'admin';

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Workspace Sub Header bar */}
      <header className="px-6 py-4 border-b border-border bg-card/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/workspaces">
            <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0">
              <Briefcase size={17} />
            </Button>
          </Link>
          <div className="h-4 w-[1px] bg-border shrink-0" />
          <div>
            <h1 className="font-display font-bold text-base text-foreground flex items-center gap-2">
              {activeWorkspace.name}
            </h1>
            <p className="text-xs text-muted-foreground truncate max-w-sm mt-0.5">{activeWorkspace.description || 'Teammate Collaboration Workspace'}</p>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex items-center bg-secondary/80 border border-border/60 rounded-xl p-1 shrink-0">
          {[
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'board', label: 'Project Board', icon: ListTodo },
            { id: 'notes', label: 'Notes', icon: FileText },
            { id: 'analytics', label: 'Analytics', icon: TrendingUp },
            { id: 'members', label: 'Members', icon: Users }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-xs font-display font-medium rounded-lg transition-colors',
                activeTab === t.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon size={13} className="text-primary/75" />
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main Tab Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* TAB 1: Isolated Workspace Channels Chat */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar list of Channels */}
            <aside className="w-56 border-r border-border bg-card/10 shrink-0 flex flex-col overflow-y-auto px-4 py-5 gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest font-display font-bold text-muted-foreground">Channels</span>
                {isAdmin && (
                  <button 
                    onClick={() => setShowChannelModal(true)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="Create Channel"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {activeWorkspace.channels?.map(channel => (
                  <div
                    key={channel._id}
                    className={cn(
                      'w-full flex items-center justify-between rounded-lg text-xs font-body font-medium transition-all group/channel-item',
                      activeChannelId === channel._id
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    )}
                  >
                    <button
                      onClick={() => setActiveChannelId(channel._id)}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left truncate"
                    >
                      <span className="text-primary/60 font-mono font-bold">#</span>
                      <span className="truncate">{channel.name}</span>
                    </button>
                    {isAdmin && channel.name !== 'general' && channel.name !== 'announcements' && (
                      <div className="flex items-center gap-1 pr-2 opacity-0 group-hover/channel-item:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditChannelId(channel._id);
                            setEditChannelName(channel.name);
                            setEditChannelDesc(channel.description || '');
                            setShowEditChannelModal(true);
                          }}
                          className="p-1 hover:text-primary transition-colors text-muted-foreground"
                          title="Edit Channel"
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Are you sure you want to delete channel #${channel.name}? All channel messages will be permanently deleted.`)) {
                              await deleteChannel(channel._id);
                              if (activeChannelId === channel._id && activeWorkspace.channels?.length > 0) {
                                setActiveChannelId(activeWorkspace.channels[0]._id);
                              }
                            }
                          }}
                          className="p-1 hover:text-destructive transition-colors text-muted-foreground"
                          title="Delete Channel"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {/* Main Channel Chats feeds */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-background">
              {activeChannel ? (
                <>
                  {/* Channel description title bar */}
                  <div className="px-6 py-3 border-b border-border bg-card/10 shrink-0">
                    <p className="text-xs font-display font-bold text-foreground">
                      <span className="text-muted-foreground font-mono font-bold mr-0.5">#</span>
                      {activeChannel.name}
                    </p>
                    {activeChannel.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{activeChannel.description}</p>
                    )}
                  </div>

                  {/* Channel messages list */}
                  <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                    {currentMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center opacity-80">
                        <span className="text-3xl">💬</span>
                        <p className="text-muted-foreground text-xs font-display mt-2">
                          This is the beginning of the <span className="font-bold">#{activeChannel.name}</span> channel.
                        </p>
                      </div>
                    ) : (
                      currentMessages.map((msg, index) => (
                        <div key={msg._id || index} className="flex items-start gap-3">
                          <Avatar className="h-8 w-8 mt-0.5">
                            <AvatarFallback className="text-[10px] bg-secondary text-muted-foreground">
                              {getInitials(msg.senderName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-display font-bold text-foreground">{msg.senderName}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {format(new Date(msg.createdAt || Date.now()), 'h:mm a')}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground/90 mt-0.5 leading-relaxed break-words">
                              {renderTextWithMentions(msg.text, activeWorkspace.members)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Typing indicators */}
                  {activeChannelId && typingUsers[activeChannelId] && Object.keys(typingUsers[activeChannelId]).length > 0 && (
                    <div className="px-6 py-1.5 text-[10px] text-muted-foreground italic flex items-center gap-1.5 animate-fade-in shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-pulse" />
                      <span>
                        {Object.values(typingUsers[activeChannelId]).join(', ')}{' '}
                        {Object.keys(typingUsers[activeChannelId]).length === 1 ? 'is' : 'are'}{' '}
                        typing...
                      </span>
                    </div>
                  )}

                  {/* Message Input box */}
                  <div className="px-6 py-4 border-t border-border bg-card/10 shrink-0 relative">
                    {/* Mention Autocomplete Dropdown */}
                    {showMentionDropdown && filteredMembers.length > 0 && (
                      <div className="absolute bottom-full left-6 mb-2 bg-card border border-border rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto p-1.5 z-40 animate-fade-in backdrop-blur-md">
                        <div className="px-2.5 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground font-bold font-display border-b border-border/40">Teammates to mention</div>
                        {filteredMembers.map((m, idx) => (
                          <button
                            key={m.user._id}
                            type="button"
                            onClick={() => insertMention(m.user.name)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-left transition-colors",
                              idx === mentionIndex
                                ? "bg-primary/15 text-primary"
                                : "text-foreground hover:bg-secondary/60"
                            )}
                          >
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[8px] bg-secondary text-primary font-display font-bold">
                                {getInitials(m.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{m.user.name}</span>
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
                              setChatDraft(prev => prev + emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="w-7 h-7 text-sm flex items-center justify-center rounded-lg hover:bg-secondary transition-all"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {channelSummary && (
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl relative animate-fade-in text-xs text-foreground leading-relaxed shadow-sm mb-3">
                        <button
                          type="button"
                          onClick={() => setChannelSummary('')}
                          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          title="Close Summary"
                        >
                          <X size={12} />
                        </button>
                        <div className="flex items-center gap-1.5 font-display font-extrabold text-[10px] text-primary uppercase tracking-wider mb-1">
                          <Sparkles size={11} className="text-primary animate-pulse" /> Chat Summary
                        </div>
                        <p className="pr-4 font-medium select-text">{channelSummary}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3 bg-secondary border border-border/80 focus-within:border-primary/40 rounded-xl px-4 py-2 transition-colors">
                      <input 
                        value={chatDraft}
                        onChange={handleChatInputChange}
                        onKeyDown={handleChatKeyDown}
                        placeholder={`Message #${activeChannel.name}…`}
                        className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
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
                        <Smile size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleSummarizeChannel}
                        disabled={summarizingChannel}
                        className={cn(
                          'w-7 h-7 rounded-lg border border-primary/25 text-primary bg-primary/5 hover:bg-primary/10 flex items-center justify-center transition-all mr-1 shrink-0',
                          summarizingChannel && 'opacity-60 cursor-not-allowed'
                        )}
                        title="Summarize Chat Messages"
                      >
                        {summarizingChannel ? (
                          <svg className="animate-spin h-3 w-3 text-primary" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <Sparkles size={13} />
                        )}
                      </button>
                      <button
                        onClick={handleSendChat}
                        disabled={!chatDraft.trim()}
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                          chatDraft.trim()
                            ? 'bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm'
                            : 'text-muted-foreground opacity-40 cursor-not-allowed'
                        )}
                      >
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-xs text-muted-foreground">Please select a channel to start messaging.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Workspace Project Kanban Task Board */}
        {activeTab === 'board' && (
          <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
            
            {/* Board Header control bar */}
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display font-bold text-base text-foreground">Kanban Workflow Board</h3>
                <p className="text-xs text-muted-foreground">Instantly synchronize, assign, and organize tasks across Todo, In Progress, and Done.</p>
              </div>
              <Button onClick={() => { setTaskColumn('todo'); setShowTaskModal(true); }} size="sm" className="gap-1.5 text-xs font-display">
                <Plus size={14} />
                Add Task
              </Button>
            </div>

            {/* Kanban Column Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden min-h-0">
              
              {/* Columns iterator */}
              {[
                { id: 'todo', label: 'Todo', color: 'border-t-sky-400 bg-sky-500/5' },
                { id: 'in-progress', label: 'In Progress', color: 'border-t-amber-400 bg-amber-500/5' },
                { id: 'done', label: 'Done', color: 'border-t-emerald-400 bg-emerald-500/5' }
              ].map(col => {
                const columnTasks = tasks.filter(t => t.status === col.id);
                return (
                  <div key={col.id} className="flex flex-col rounded-2xl border border-border bg-card/45 overflow-hidden max-h-full">
                    {/* Column label header */}
                    <div className={cn("px-4 py-3.5 border-b border-border/80 border-t-2 flex items-center justify-between", col.color)}>
                      <span className="text-xs font-display font-bold text-foreground">{col.label}</span>
                      <Badge variant="secondary" className="text-[10px] font-bold shrink-0">{columnTasks.length}</Badge>
                    </div>

                    {/* Task cards list */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {columnTasks.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-1 opacity-70">
                          <span className="text-base">📋</span>
                          <p className="text-[10px] text-muted-foreground font-display mt-1">No tasks in this stage</p>
                        </div>
                      ) : (
                        columnTasks.map(task => (
                          <div 
                            key={task._id}
                            className="bg-card border border-border/60 rounded-xl p-4 shadow-sm hover:border-primary/30 transition-all flex flex-col gap-3 group relative"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="text-xs font-display font-bold text-foreground line-clamp-1 leading-snug">{task.title}</h4>
                              <Badge 
                                variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'warning' : 'default'}
                                className="text-[9px] font-bold capitalize px-1 py-0.5 scale-90 shrink-0"
                              >
                                {task.priority}
                              </Badge>
                            </div>

                            {task.description && (
                              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{task.description}</p>
                            )}

                            {/* Task meta details footer */}
                            <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/30 mt-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <Calendar size={11} className="text-primary/70 shrink-0" />
                                <span>{task.dueDate ? format(new Date(task.dueDate), 'MMM d') : 'No due date'}</span>
                              </div>
                              {task.assignee ? (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Avatar className="h-5 w-5 scale-90">
                                    <AvatarFallback className="text-[8px] font-bold bg-secondary text-primary font-display">
                                      {getInitials(task.assignee.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate max-w-[64px]">{task.assignee.name.split(' ')[0]}</span>
                                </div>
                              ) : (
                                <span className="text-[9px] text-muted-foreground font-body italic shrink-0">Unassigned</span>
                              )}
                            </div>

                            {/* Click status update controls */}
                            <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex items-center bg-card border border-border rounded-lg shadow-sm p-0.5 transition-opacity">
                              {isAdmin && (
                                <button 
                                  onClick={() => handleDeleteTask(task._id)}
                                  title="Delete Task"
                                  className="p-1 hover:text-destructive transition-colors text-muted-foreground"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                              {col.id === 'todo' && (
                                <button 
                                  onClick={() => handleMoveTask(task._id, 'in-progress')}
                                  title="Move to In Progress"
                                  className={cn("p-1 hover:text-primary transition-colors text-muted-foreground", isAdmin && "border-l border-border")}
                                >
                                  <ArrowRight size={12} />
                                </button>
                              )}
                              {col.id === 'in-progress' && (
                                <>
                                  <button 
                                    onClick={() => handleMoveTask(task._id, 'todo')}
                                    title="Move back to Todo"
                                    className={cn("p-1 hover:text-primary rotate-180 transition-colors text-muted-foreground", isAdmin && "border-l border-border")}
                                  >
                                    <ArrowRight size={12} />
                                  </button>
                                  <button 
                                    onClick={() => handleMoveTask(task._id, 'done')}
                                    title="Move to Done"
                                    className="p-1 hover:text-primary transition-colors text-muted-foreground border-l border-border"
                                  >
                                    <ArrowRight size={12} />
                                  </button>
                                </>
                              )}
                              {col.id === 'done' && (
                                <button 
                                  onClick={() => handleMoveTask(task._id, 'in-progress')}
                                  title="Move back to In Progress"
                                  className={cn("p-1 hover:text-primary rotate-180 transition-colors text-muted-foreground", isAdmin && "border-l border-border")}
                                >
                                  <ArrowRight size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kanban task creation modal */}
            {showTaskModal && (
              <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
                  <div className="px-6 py-5 border-b border-border">
                    <h3 className="font-display font-bold text-lg text-foreground">Add Workspace Task</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Assign sprints, set priorities, and create real-time kanban action items.</p>
                  </div>
                  <form onSubmit={handleCreateTask} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="task-title" className="text-xs font-semibold text-muted-foreground font-display">Task Title</label>
                      <Input 
                        id="task-title"
                        required
                        placeholder="e.g. Design Database Schemas" 
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="task-desc" className="text-xs font-semibold text-muted-foreground font-display">Description</label>
                      <textarea 
                        id="task-desc"
                        rows={2}
                        placeholder="Detail the sprint task requirements..." 
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                        value={taskDesc}
                        onChange={(e) => setTaskDesc(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="task-priority" className="text-xs font-semibold text-muted-foreground font-display">Priority</label>
                        <select
                          id="task-priority"
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="task-assignee" className="text-xs font-semibold text-muted-foreground font-display">Assignee</label>
                        <select
                          id="task-assignee"
                          value={taskAssignee}
                          onChange={(e) => setTaskAssignee(e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                        >
                          <option value="">Unassigned</option>
                          {activeWorkspace.members?.map(m => (
                            <option key={m.user?._id} value={m.user?._id}>{m.user?.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="task-due" className="text-xs font-semibold text-muted-foreground font-display">Due Date</label>
                      <Input 
                        id="task-due"
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowTaskModal(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm">
                        Create Task
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Collaborative Notes & Synchronized Document */}
        {activeTab === 'notes' && (
          <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
            
            {/* Notes status bar */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3 shrink-0">
              <div>
                <h3 className="font-display font-bold text-base text-foreground">Collaborative Work Notes</h3>
                <p className="text-xs text-muted-foreground">
                  Synchronize meeting minutes, notes, and checklist documents in real time.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-display font-medium text-muted-foreground uppercase tracking-widest select-none">
                  {savingNotes ? 'Saving edits...' : 'All changes saved'}
                </span>
              </div>
            </div>

            {/* Editing canvas */}
            <div className="flex-1 flex flex-col bg-card/25 border border-border rounded-2xl overflow-hidden p-4">
              <textarea 
                value={notes.content || ''}
                onChange={handleNotesChange}
                placeholder="# Team Collaborative Canvas..."
                className="flex-1 w-full h-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed font-body"
              />
              {notes.lastUpdatedBy && (
                <div className="pt-2 border-t border-border/40 text-[10px] text-muted-foreground/80 flex items-center justify-end gap-1.5">
                  <FileText size={10} />
                  <span>Last synced edit by: <span className="font-bold text-primary">{notes.lastUpdatedBy.name}</span></span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Team Members & invites management */}
        {activeTab === 'members' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-6 gap-6">
            
            {/* Members Directory Left Pane */}
            <div className="flex-1 flex flex-col bg-card/20 border border-border rounded-2xl p-6 overflow-hidden min-w-0">
              <h3 className="font-display font-bold text-base text-foreground">Workspace Members</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Teammates authorized to view this isolated collaborative space.</p>
              
              <div className="flex-1 overflow-y-auto space-y-4 mt-6">
                {activeWorkspace.members?.map(m => {
                  if (!m.user) return null;
                  const isUserAdmin = m.role === 'admin';
                  return (
                    <div key={m.user._id} className="flex items-center justify-between gap-4 py-2 border-b border-border/20 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs font-semibold bg-secondary text-primary">
                              {getInitials(m.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          {m.user.status && m.user.status !== 'offline' && (
                            <span className={cn(
                              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                              m.user.status === 'online' && 'bg-emerald-400',
                              m.user.status === 'away' && 'bg-amber-400',
                              m.user.status === 'in-meeting' && 'bg-violet-500'
                            )} />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-display font-bold text-foreground">
                            {m.user.name} {m.user._id?.toString() === user?.id?.toString() && '(You)'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{m.user.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge variant={isUserAdmin ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0.5 uppercase tracking-wide font-bold scale-90">
                          {m.role}
                        </Badge>
                        {isAdmin && m.user._id?.toString() !== user?.id?.toString() && (
                          <button
                            onClick={() => handleRemoveUser(m.user._id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove Member"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invite Teammate Right Pane (Admin Only) */}
            <div className="w-full md:w-80 shrink-0 flex flex-col bg-card/40 border border-border rounded-2xl p-6 gap-5 h-fit">
              <div>
                <h3 className="font-display font-bold text-sm text-foreground">Invite Teammate</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Authorise members to join the team workspace instantly.</p>
              </div>

              {isAdmin ? (
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="member-email" className="text-xs font-semibold text-muted-foreground font-display">Teammate Email</label>
                    <Input 
                      id="member-email"
                      required
                      type="email"
                      placeholder="e.g. teammate@domain.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="member-role" className="text-xs font-semibold text-muted-foreground font-display">Access Role</label>
                    <select
                      id="member-role"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                    >
                      <option value="member">Collaborating Member</option>
                      <option value="admin">Workspace Admin</option>
                    </select>
                  </div>
                  <Button type="submit" className="w-full gap-1.5 mt-2 h-9 text-xs">
                    <UserPlus size={14} />
                    Add Member
                  </Button>
                </form>
              ) : (
                <div className="bg-secondary/40 border border-border/80 rounded-xl p-4 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
                  <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <span>Only Workspace Administrators can invite or remove members from this team space.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: Workspace Analytics & Insights */}
        {activeTab === 'analytics' && (
          <WorkspaceAnalyticsView workspaceId={activeWorkspaceId} members={activeWorkspace.members} tasks={tasks} />
        )}
        {/* Create Channel Modal dialog */}
        {showChannelModal && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="px-6 py-5 border-b border-border">
                <h3 className="font-display font-bold text-lg text-foreground">Create Text Channel</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-display">Create a subchannel inside this workspace for dedicated topic chats.</p>
              </div>
              <form onSubmit={handleCreateChannel} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="channel-name" className="text-xs font-semibold text-muted-foreground font-display">Channel Name</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm font-bold">#</span>
                    <Input 
                      id="channel-name"
                      required
                      placeholder="e.g. backend-dev" 
                      className="pl-7"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="channel-desc" className="text-xs font-semibold text-muted-foreground font-display">Purpose / Description</label>
                  <textarea 
                    id="channel-desc"
                    rows={3}
                    placeholder="Briefly state the goal of this channel..." 
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                    value={newChannelDesc}
                    onChange={(e) => setNewChannelDesc(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowChannelModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Create Channel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Channel Modal dialog */}
        {showEditChannelModal && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="px-6 py-5 border-b border-border">
                <h3 className="font-display font-bold text-lg text-foreground">Edit Text Channel</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-display">Update channel details for this workspace.</p>
              </div>
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editChannelName.trim()) return;
                  const ws = await editChannel(editChannelId, editChannelName.trim(), editChannelDesc.trim());
                  if (ws) {
                    setShowEditChannelModal(false);
                    setEditChannelId(null);
                    setEditChannelName('');
                    setEditChannelDesc('');
                  }
                }} 
                className="p-6 space-y-4"
              >
                <div className="space-y-1.5">
                  <label htmlFor="edit-channel-name" className="text-xs font-semibold text-muted-foreground font-display">Channel Name</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm font-bold">#</span>
                    <Input 
                      id="edit-channel-name"
                      required
                      placeholder="e.g. backend-dev" 
                      className="pl-7"
                      value={editChannelName}
                      onChange={(e) => setEditChannelName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="edit-channel-desc" className="text-xs font-semibold text-muted-foreground font-display">Purpose / Description</label>
                  <textarea 
                    id="edit-channel-desc"
                    rows={3}
                    placeholder="Briefly state the goal of this channel..." 
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-ring"
                    value={editChannelDesc}
                    onChange={(e) => setEditChannelDesc(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
                  <Button type="button" variant="outline" size="sm" onClick={() => {
                    setShowEditChannelModal(false);
                    setEditChannelId(null);
                    setEditChannelName('');
                    setEditChannelDesc('');
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save Changes
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceAnalyticsView({ workspaceId, members, tasks }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/analytics`);
        if (res.ok) {
          const resData = await res.json();
          setData(resData);
        } else {
          setError('Failed to fetch analytics metrics.');
        }
      } catch (err) {
        setError('Network error loading analytics.');
      } finally {
        setLoading(false);
      }
    };
    if (workspaceId) {
      fetchAnalytics();
    }
  }, [workspaceId, tasks]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3 min-h-[400px]">
        <svg className="animate-spin h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-muted-foreground text-xs font-semibold">Generating analytics intelligence reports…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[400px] space-y-4">
        <p className="text-destructive font-semibold text-sm">{error || 'Unable to generate workspace metrics.'}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const { tasks: taskStats, engagement, meetings } = data;

  // Format durations into human-readable minutes/seconds
  const formatDuration = (seconds) => {
    if (!seconds) return '0m';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // CSV Exporter
  const handleExportCSV = () => {
    const rows = [
      ["--- WORKSPACE KPI SUMMARY ---"],
      ["Metric", "Value"],
      ["Total Completed Meetings", meetings.total],
      ["Total Combined Meeting Duration (seconds)", meetings.totalDuration],
      ["Average Meeting Duration (seconds)", meetings.avgDuration],
      ["Total Tasks Count", taskStats.total],
      ["Todo Tasks Count", taskStats.todo],
      ["In-Progress Tasks Count", taskStats.inProgress],
      ["Completed Tasks Count", taskStats.completed],
      ["Productivity Rate (%)", `${taskStats.productivityRate}%`],
      [],
      ["--- TEAM TASK PRODUCTIVITY ---"],
      ["Name", "Total Tasks", "Completed Tasks", "Productivity Rate (%)"],
      ...taskStats.assigneeStats.map(a => [
        a.name, 
        a.total, 
        a.completed, 
        a.total > 0 ? `${Math.round((a.completed / a.total) * 100)}%` : '0%'
      ]),
      [],
      ["--- TEAM CHAT ENGAGEMENT ---"],
      ["Name", "Messages Sent"],
      ...engagement.chatStats.map(c => [c.name, c.count]),
      [],
      ["--- TEAM CALL PRESENCE ---"],
      ["Name", "Meetings Attended"],
      ...meetings.callPresence.map(p => [p.name, p.meetingsAttended]),
      [],
      ["--- SPRINT VELOCITY (LAST 7 DAYS) ---"],
      ["Date", "Completed Tasks"],
      ...taskStats.velocity.map(v => [v.name, v.completed]),
      [],
      ["--- CALL DURATION (LAST 7 DAYS) ---"],
      ["Date", "Meeting Minutes"],
      ...meetings.dailyDurations.map(m => [m.name, m.duration])
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `workspace_analytics_${workspaceId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  // SVGs Chart computations
  // 1. Sprint Velocity Chart Area SVG parameters
  const velocityMax = Math.max(...taskStats.velocity.map(v => v.completed), 3);
  const vPoints = taskStats.velocity.map((v, idx) => {
    const x = 50 + idx * 80;
    const y = 170 - (v.completed / velocityMax) * 120;
    return { x, y, name: v.name, val: v.completed };
  });
  const vPathData = vPoints.length > 0 
    ? `M ${vPoints[0].x} ${vPoints[0].y} ` + vPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') 
    : '';
  const vAreaPathData = vPoints.length > 0 
    ? `${vPathData} L ${vPoints[vPoints.length - 1].x} 170 L ${vPoints[0].x} 170 Z` 
    : '';

  // 2. Call Duration Chart Bar SVG parameters
  const durationMax = Math.max(...meetings.dailyDurations.map(d => d.duration), 15);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background/5 min-w-0 print-layout">
      {/* Dynamic inline styles for browser print overrides */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          header, aside, footer, nav, button, .no-print {
            display: none !important;
          }
          .print-layout {
            background-color: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
          .card-print {
            background-color: white !important;
            border: 1px solid #ddd !important;
            color: black !important;
            box-shadow: none !important;
            break-inside: avoid;
          }
          .text-foreground, h1, h2, h3, h4, p, span, td, th {
            color: black !important;
          }
          .text-primary {
            color: #0284c7 !important;
          }
          svg text {
            fill: black !important;
          }
          svg path, svg rect {
            stroke: #555 !important;
          }
          .grid {
            display: block !important;
          }
          .grid > div {
            margin-bottom: 20px !important;
            width: 100% !important;
          }
        }
      `}} />

      {/* Header controls block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5 no-print">
        <div>
          <h2 className="font-display font-extrabold text-xl text-foreground flex items-center gap-2">
            <TrendingUp className="text-primary animate-pulse" size={20} />
            Workspace Intelligence Dashboard
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium leading-relaxed">
            Real-time analytics covering sprint productivity metrics, channel communication engagement, and daily meeting call presence.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button onClick={handleExportCSV} variant="outline" size="sm" className="gap-1.5 text-xs font-semibold shadow-sm h-9">
            <Download size={13} />
            Export CSV Data
          </Button>
          <Button onClick={handlePrintPDF} size="sm" className="gap-1.5 text-xs font-semibold shadow-sm h-9 bg-primary text-primary-foreground hover:bg-primary/95">
            <Printer size={13} />
            Print PDF Report
          </Button>
        </div>
      </div>

      {/* Print Only Header */}
      <div className="hidden print-only border-b border-gray-300 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-black">MeetFlow Workspace Intelligence Report</h1>
        <p className="text-xs text-gray-500 mt-1">Generated: {new Date().toLocaleString()} · Workspace ID: {workspaceId}</p>
      </div>

      {/* Primary KPI Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI 1: Completed Meetings */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-primary/30 hover:scale-[1.01] transition-all duration-200 card-print">
          <div className="w-11 h-11 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
            <BarChart2 size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground tracking-tight">{meetings.total}</p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Calls Completed</p>
          </div>
        </div>

        {/* KPI 2: Avg Call Length */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-violet-500/30 hover:scale-[1.01] transition-all duration-200 card-print">
          <div className="w-11 h-11 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground tracking-tight">
              {meetings.avgDuration > 0 ? formatDuration(meetings.avgDuration) : '0m'}
            </p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Avg Call Duration</p>
          </div>
        </div>

        {/* KPI 3: Task Productivity */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-emerald-500/30 hover:scale-[1.01] transition-all duration-200 card-print">
          <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-extrabold text-foreground tracking-tight">{taskStats.productivityRate}%</p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
              Task Productivity ({taskStats.completed}/{taskStats.total})
            </p>
          </div>
        </div>

        {/* KPI 4: Communication count */}
        <div className="bg-card border border-border/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-amber-500/30 hover:scale-[1.01] transition-all duration-200 card-print">
          <div className="w-11 h-11 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
            <MessageSquare size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground tracking-tight">
              {engagement.chatStats.reduce((acc, curr) => acc + curr.count, 0)}
            </p>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Messages Sent</p>
          </div>
        </div>

      </div>

      {/* Row 1 - Glowing SVG Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Sprint Task Completion Velocity Line Chart */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4 card-print">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Sprint Task Velocity Tracker</h3>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Daily completed tasks aggregate over the last 7 calendar days</p>
          </div>
          <div className="flex justify-center py-2 h-48 relative">
            {vPoints.length === 0 ? (
              <p className="text-xs text-muted-foreground self-center">No task completion logs available yet.</p>
            ) : (
              <svg viewBox="0 0 580 200" className="w-full h-full">
                {/* Horizontal gridlines */}
                {[0, 1, 2, 3, 4].map(g => (
                  <line key={g} x1="40" y1={50 + g * 30} x2="540" y2={50 + g * 30} stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                ))}
                
                {/* Area Gradient fill */}
                <defs>
                  <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={vAreaPathData} fill="url(#velocityGrad)" />
                
                {/* Main line */}
                <path d={vPathData} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" />
                
                {/* Nodes & Tooltips */}
                {vPoints.map((pt, idx) => (
                  <g key={idx}>
                    <circle cx={pt.x} cy={pt.y} r="4" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2.5" className="hover:scale-125 transition-transform" />
                    <text x={pt.x} y={pt.y - 10} textAnchor="middle" fontSize="10" fontWeight="bold" fill="hsl(var(--foreground))" opacity="0.9">{pt.val}</text>
                    <text x={pt.x} y="188" textAnchor="middle" fontSize="9" fontWeight="semibold" fill="hsl(var(--muted-foreground))">{pt.name}</text>
                  </g>
                ))}
                
                {/* Side axis labels */}
                <text x="30" y="53" textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">{velocityMax}</text>
                <text x="30" y="113" textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">{Math.round(velocityMax / 2)}</text>
                <text x="30" y="173" textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">0</text>
              </svg>
            )}
          </div>
        </div>

        {/* Meeting Minutes Call Duration Bar Chart */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4 card-print">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Call Duration Frequencies</h3>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Sum of daily meeting minutes tracked across the last 7 calendar days</p>
          </div>
          <div className="flex justify-center py-2 h-48 relative">
            {meetings.dailyDurations.length === 0 ? (
              <p className="text-xs text-muted-foreground self-center">No meeting telemetry logs recorded yet.</p>
            ) : (
              <svg viewBox="0 0 580 200" className="w-full h-full">
                {/* Horizontal gridlines */}
                {[0, 1, 2, 3, 4].map(g => (
                  <line key={g} x1="40" y1={50 + g * 30} x2="540" y2={50 + g * 30} stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                ))}

                {/* Bars Iterator */}
                {meetings.dailyDurations.map((d, idx) => {
                  const x = 55 + idx * 72;
                  const barHeight = Math.max(3, (d.duration / durationMax) * 120);
                  const y = 170 - barHeight;
                  return (
                    <g key={idx}>
                      <rect 
                        x={x} 
                        y={y} 
                        width="30" 
                        height={barHeight} 
                        rx="4" 
                        fill="hsl(var(--primary) / 0.1)"
                        stroke="hsl(var(--primary))"
                        strokeWidth="1.5"
                        className="hover:fill-primary/20 transition-all duration-200" 
                      />
                      <text x={x + 15} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill="hsl(var(--foreground))">{d.duration}m</text>
                      <text x={x + 15} y="188" textAnchor="middle" fontSize="9" fontWeight="semibold" fill="hsl(var(--muted-foreground))">{d.name}</text>
                    </g>
                  );
                })}

                {/* Side axis labels */}
                <text x="30" y="53" textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">{durationMax}m</text>
                <text x="30" y="113" textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">{Math.round(durationMax / 2)}m</text>
                <text x="30" y="173" textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))">0m</text>
              </svg>
            )}
          </div>
        </div>

      </div>

      {/* Row 2 - Leaderboards & Attendance trackers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Productivity Leaderboard */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4 card-print">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Teammate Action Leaderboard</h3>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Ranked by total task completion ratios and channel message activity volumes</p>
          </div>
          
          <div className="space-y-4 pt-2">
            {taskStats.assigneeStats.map((assignee) => {
              const chat = engagement.chatStats.find(c => c.userId === assignee.userId) || { count: 0 };
              const rate = assignee.total > 0 ? Math.round((assignee.completed / assignee.total) * 100) : 0;
              return (
                <div key={assignee.userId} className="space-y-1.5 border-b border-border/20 last:border-b-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-foreground">{assignee.name}</span>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      {assignee.completed}/{assignee.total} Sprints · {chat.count} msgs
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Visual custom progress bar */}
                    <div className="flex-1 h-2 bg-secondary rounded overflow-hidden border border-border/40">
                      <div 
                        className="h-full bg-primary rounded transition-all duration-500" 
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-primary w-8 text-right shrink-0">{rate}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Meeting Attendance (Presence tracker) */}
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4 card-print">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Teammate Call Presence Tracker</h3>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Aggregate meeting call attendance index computed for this isolated sprint group</p>
          </div>

          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-[9px] uppercase font-bold tracking-wider text-muted-foreground">
                  <th className="py-2.5 pb-2">Teammate Name</th>
                  <th className="py-2.5 pb-2 text-center">Calls Attended</th>
                  <th className="py-2.5 pb-2 text-right">Commitment Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-xs font-semibold">
                {meetings.callPresence.map((member) => {
                  const attendanceRatio = meetings.total > 0 
                    ? Math.round((member.meetingsAttended / meetings.total) * 100) 
                    : 0;
                  return (
                    <tr key={member.userId} className="text-muted-foreground hover:text-foreground transition-colors">
                      <td className="py-3 font-display font-bold text-foreground">{member.name}</td>
                      <td className="py-3 text-center font-mono">{member.meetingsAttended} / {meetings.total}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border uppercase ${
                          attendanceRatio >= 75 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : attendanceRatio >= 40 
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                            : 'bg-destructive/10 text-destructive border-destructive/20'
                        }`}>
                          {attendanceRatio}% Presence
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
