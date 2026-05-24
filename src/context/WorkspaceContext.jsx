import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io } from 'socket.io-client';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [channelMessages, setChannelMessages] = useState({}); // { channelId: [messages...] }
  const [notes, setNotes] = useState({ content: '', lastUpdatedBy: null });
  
  const socketRef = useRef(null);
  const activeWorkspaceIdRef = useRef(null);
  const saveNotesTimeoutRef = useRef(null);

  // Sync activeWorkspaceId to ref for Socket callbacks
  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  // Load workspaces when user logs in
  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setActiveWorkspaceId(null);
      if (socketRef.current) socketRef.current.disconnect();
      return;
    }

    const fetchWorkspaces = async () => {
      try {
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const data = await res.json();
          setWorkspaces(data);
        }
      } catch (err) {
        console.error('Failed to fetch workspaces:', err);
      }
    };
    fetchWorkspaces();

    // Setup Socket
    socketRef.current = io('http://localhost:5000', {
      withCredentials: true,
    });

    socketRef.current.on('connect', () => {
      if (activeWorkspaceIdRef.current) {
        socketRef.current.emit('join_workspace', { workspaceId: activeWorkspaceIdRef.current });
      }
    });

    // Subscriptions
    socketRef.current.on('workspace_message_received', (msg) => {
      setChannelMessages(prev => {
        const existing = prev[msg.channelId] || [];
        if (existing.some(m => m._id === msg._id)) return prev;
        return {
          ...prev,
          [msg.channelId]: [...existing, msg]
        };
      });
    });

    socketRef.current.on('workspace_task_synced', (updatedTask) => {
      setTasks(prev => {
        const index = prev.findIndex(t => t._id === updatedTask._id);
        if (index === -1) {
          return [...prev, updatedTask];
        }
        return prev.map(t => t._id === updatedTask._id ? updatedTask : t);
      });
    });

    socketRef.current.on('workspace_notes_synced', ({ content, lastUpdatedBy }) => {
      setNotes({ content, lastUpdatedBy });
    });

    socketRef.current.on('workspace_updated', (updatedWs) => {
      if (activeWorkspaceIdRef.current === updatedWs._id) {
        setActiveWorkspace(updatedWs);
      }
      setWorkspaces(prev => prev.map(w => w._id === updatedWs._id ? updatedWs : w));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  // Fetch workspace assets when active workspace changes
  useEffect(() => {
    if (!activeWorkspaceId || !user) return;

    // Join Socket Room
    if (socketRef.current) {
      socketRef.current.emit('join_workspace', { workspaceId: activeWorkspaceId });
    }

    const fetchWorkspaceDetails = async () => {
      try {
        const [wsRes, tasksRes, notesRes] = await Promise.all([
          fetch(`/api/workspaces/${activeWorkspaceId}`),
          fetch(`/api/workspaces/${activeWorkspaceId}/tasks`),
          fetch(`/api/workspaces/${activeWorkspaceId}/notes`)
        ]);

        if (wsRes.ok) {
          const wsData = await wsRes.json();
          setActiveWorkspace(wsData);
        }
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          setTasks(tasksData);
        }
        if (notesRes.ok) {
          const notesData = await notesRes.json();
          setNotes({ content: notesData.content, lastUpdatedBy: notesData.lastUpdatedBy });
        }
      } catch (err) {
        console.error('Failed to load workspace assets:', err);
      }
    };

    fetchWorkspaceDetails();
  }, [activeWorkspaceId, user]);

  const createWorkspace = useCallback(async (name, description) => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(prev => [...prev, data]);
        setActiveWorkspaceId(data._id);
        return data;
      }
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  }, []);

  const createChannel = useCallback(async (name, description) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveWorkspace(data);
        setWorkspaces(prev => prev.map(w => w._id === data._id ? data : w));
        // Sync via Socket
        if (socketRef.current) {
          socketRef.current.emit('create_channel', { workspaceId: activeWorkspaceId, workspace: data });
        }
        return data;
      }
    } catch (err) {
      console.error('Failed to create channel:', err);
    }
  }, [activeWorkspaceId]);

  const inviteMember = useCallback(async (email, role = 'member') => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveWorkspace(data);
        setWorkspaces(prev => prev.map(w => w._id === data._id ? data : w));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to invite member:', err);
      return false;
    }
  }, [activeWorkspaceId]);

  const removeMember = useCallback(async (userId) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members/${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        setActiveWorkspace(data);
        setWorkspaces(prev => prev.map(w => w._id === data._id ? data : w));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to remove member:', err);
      return false;
    }
  }, [activeWorkspaceId]);

  const fetchChannelMessages = useCallback(async (channelId) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/channels/${channelId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: data
        }));
      }
    } catch (err) {
      console.error('Failed to fetch channel messages:', err);
    }
  }, [activeWorkspaceId]);

  const sendChannelMessage = useCallback((channelId, text) => {
    if (!socketRef.current || !activeWorkspaceId || !user) return;

    socketRef.current.emit('send_workspace_message', {
      workspaceId: activeWorkspaceId,
      channelId,
      senderId: user.id,
      senderName: user.name,
      text
    });
  }, [activeWorkspaceId, user]);

  const createTask = useCallback(async (taskData) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => [...prev, data]);
        // Sync via Socket
        if (socketRef.current) {
          socketRef.current.emit('update_workspace_task', { workspaceId: activeWorkspaceId, task: data });
        }
        return data;
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }, [activeWorkspaceId]);

  const updateTask = useCallback(async (taskId, updates) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => prev.map(t => t._id === taskId ? data : t));
        // Sync via Socket
        if (socketRef.current) {
          socketRef.current.emit('update_workspace_task', { workspaceId: activeWorkspaceId, task: data });
        }
        return data;
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  }, [activeWorkspaceId]);

  const saveNotesToDatabase = async (content) => {
    if (!activeWorkspaceId) return;
    try {
      await fetch(`/api/workspaces/${activeWorkspaceId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    } catch (err) {
      console.error('Failed to save notes to database:', err);
    }
  };

  const editNotes = useCallback((content) => {
    if (!activeWorkspaceId || !user) return;
    
    // Sync note locally
    setNotes({ content, lastUpdatedBy: { name: user.name } });

    // Sync via socket (real-time)
    if (socketRef.current) {
      socketRef.current.emit('edit_workspace_notes', {
        workspaceId: activeWorkspaceId,
        content,
        senderId: user.id
      });
    }

    // Debounce save note to DB (2 seconds delay)
    if (saveNotesTimeoutRef.current) {
      clearTimeout(saveNotesTimeoutRef.current);
    }

    saveNotesTimeoutRef.current = setTimeout(() => {
      saveNotesToDatabase(content);
    }, 2000);
  }, [activeWorkspaceId, user]);

  return (
    <WorkspaceContext.Provider
      value={{
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
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
