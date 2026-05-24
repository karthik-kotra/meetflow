import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
import { 
  Briefcase, MessageSquare, ListTodo, FileText, Users, 
  Plus, Send, Circle, Calendar, UserPlus, Trash2, ArrowRight,
  TrendingUp, CalendarDays, Clock, CheckCircle2, AlertCircle, ChevronRight
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
    editNotes,
    createChannel
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'board' | 'notes' | 'members'
  const [activeChannelId, setActiveChannelId] = useState(null);
  
  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

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

  const handleSendChat = () => {
    if (!chatDraft.trim() || !activeChannelId) return;
    sendChannelMessage(activeChannelId, chatDraft.trim());
    setChatDraft('');
  };

  const handleChatKeyDown = (e) => {
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
                  <button
                    key={channel._id}
                    onClick={() => setActiveChannelId(channel._id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-body font-medium transition-all text-left truncate',
                      activeChannelId === channel._id
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    )}
                  >
                    <span className="text-primary/60 font-mono font-bold">#</span>
                    <span>{channel.name}</span>
                  </button>
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
                            <p className="text-xs text-muted-foreground/90 mt-0.5 leading-relaxed break-words">{msg.text}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input box */}
                  <div className="px-6 py-4 border-t border-border bg-card/10 shrink-0">
                    <div className="flex items-center gap-3 bg-secondary border border-border/80 focus-within:border-primary/40 rounded-xl px-4 py-2 transition-colors">
                      <input 
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder={`Message #${activeChannel.name}…`}
                        className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                      />
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
                              {col.id === 'todo' && (
                                <button 
                                  onClick={() => handleMoveTask(task._id, 'in-progress')}
                                  title="Move to In Progress"
                                  className="p-1 hover:text-primary transition-colors text-muted-foreground"
                                >
                                  <ArrowRight size={12} />
                                </button>
                              )}
                              {col.id === 'in-progress' && (
                                <>
                                  <button 
                                    onClick={() => handleMoveTask(task._id, 'todo')}
                                    title="Move back to Todo"
                                    className="p-1 hover:text-primary rotate-180 transition-colors text-muted-foreground"
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
                                  className="p-1 hover:text-primary rotate-180 transition-colors text-muted-foreground"
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
      </div>
    </div>
  );
}
