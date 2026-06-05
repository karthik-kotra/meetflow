import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io } from 'socket.io-client';

const ChatContext = createContext(null);

// Synthesize a premium double-tone chime sound
const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 (587.33Hz)
    oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5 (880Hz)
    
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.25);
  } catch (error) {
    console.error('Audio play failed:', error);
  }
};

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState({}); // { contactId: [messages...] }
  const [activeContactId, setActiveContactId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState({}); // { contactId: boolean }
  const [myStatus, setMyStatus] = useState('online');
  const socketRef = useRef(null);
  const activeContactIdRef = useRef(null);

  // Sync activeContactId to a ref so the Socket.io listeners always get the fresh value
  useEffect(() => {
    activeContactIdRef.current = activeContactId;
    if (activeContactId && socketRef.current && user) {
      // Mark as read in backend
      socketRef.current.emit('mark_read', { senderId: activeContactId, receiverId: user.id });
      // Reset unread count locally
      setContacts(prev =>
        prev.map(c => c.id === activeContactId ? { ...c, unreadCount: 0 } : c)
      );
    }
  }, [activeContactId, user]);

  // Request notification permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotification = (msg, senderName) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`New message from ${senderName}`, {
        body: msg.text,
      });
    }
  };

  // Initialize Socket and fetch contacts when user logs in
  useEffect(() => {
    if (!user) {
      if (socketRef.current) socketRef.current.disconnect();
      return;
    }

    // Fetch contacts
    const fetchContacts = async () => {
      try {
        const res = await fetch('/api/users', {
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const processedContacts = data.map(c => ({
            id: c._id,
            name: c.name,
            email: c.email,
            role: c.role || 'Member',
            status: c.status || 'offline',
            lastSeen: c.lastSeen,
            unreadCount: c.unreadCount || 0
          }));
          setContacts(processedContacts);
        }
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
      }
    };
    fetchContacts();

    // Setup Socket
    socketRef.current = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
      withCredentials: true,
    });

    socketRef.current.on('connect', () => {
      socketRef.current.emit('register_user', user.id);
    });

    socketRef.current.on('online_users', (users) => {
      setOnlineUsers(users);
    });

    socketRef.current.on('status_changed', ({ userId, status, lastSeen }) => {
      setContacts((prev) =>
        prev.map((c) => (c.id === userId ? { ...c, status, lastSeen } : c))
      );
    });

    socketRef.current.on('typing', ({ senderId }) => {
      setTypingUsers((prev) => ({ ...prev, [senderId]: true }));
    });

    socketRef.current.on('stop_typing', ({ senderId }) => {
      setTypingUsers((prev) => ({ ...prev, [senderId]: false }));
    });

    socketRef.current.on('receiveMessage', (msg) => {
      const otherPersonId = msg.senderId === user.id ? msg.receiverId : msg.senderId;
      
      setMessages((prev) => {
        const existing = prev[otherPersonId] || [];
        if (existing.find(m => m._id === msg._id)) return prev;
        return {
          ...prev,
          [otherPersonId]: [...existing, msg],
        };
      });

      // Handle unread badges, sounds, and notifications
      if (msg.senderId !== user.id) {
        if (otherPersonId !== activeContactIdRef.current) {
          // Increment unread count for contact
          setContacts(prev =>
            prev.map(c => c.id === otherPersonId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c)
          );
          // Play sound
          playNotificationSound();
          // Find contact name
          setContacts(prev => {
            const sender = prev.find(c => c.id === otherPersonId);
            showBrowserNotification(msg, sender ? sender.name : 'Teammate');
            return prev;
          });
        } else {
          // If viewing this chat, mark it as read in backend
          socketRef.current.emit('mark_read', { senderId: otherPersonId, receiverId: user.id });
        }
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  // Fetch message history when clicking a contact
  useEffect(() => {
    if (!activeContactId || !user) return;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/chat/${activeContactId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(prev => ({
            ...prev,
            [activeContactId]: data
          }));
        }
      } catch (err) {
        console.error('Failed to fetch chat history', err);
      }
    };

    fetchHistory();
  }, [activeContactId, user]);

  const getMessages = useCallback(
    (contactId) => messages[contactId] || [],
    [messages]
  );

  const sendMessage = useCallback((receiverId, text) => {
    if (!socketRef.current || !user) return;
    
    socketRef.current.emit('sendMessage', {
      senderId: user.id,
      receiverId,
      text
    });
  }, [user]);

  const getLastMessage = useCallback(
    (contactId) => {
      const msgs = messages[contactId] || [];
      return msgs[msgs.length - 1] || null;
    },
    [messages]
  );

  const updateStatus = useCallback((status) => {
    if (socketRef.current && user) {
      socketRef.current.emit('update_status', { userId: user.id, status });
      setMyStatus(status);
    }
  }, [user]);

  const sendTyping = useCallback((receiverId, isTyping) => {
    if (socketRef.current && user) {
      socketRef.current.emit(isTyping ? 'typing' : 'stop_typing', {
        senderId: user.id,
        receiverId
      });
    }
  }, [user]);

  // Map online/offline status correctly
  const contactsWithStatus = contacts.map(c => {
    const isOnline = onlineUsers.includes(c.id);
    let resolvedStatus = c.status || 'offline';
    if (!isOnline && resolvedStatus !== 'offline') {
      resolvedStatus = 'offline';
    } else if (isOnline && resolvedStatus === 'offline') {
      resolvedStatus = 'online';
    }
    return {
      ...c,
      online: isOnline,
      status: resolvedStatus
    };
  });

  const totalUnreadCount = contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <ChatContext.Provider
      value={{ 
        contacts: contactsWithStatus, 
        messages, 
        activeContactId, 
        setActiveContactId, 
        getMessages, 
        sendMessage, 
        getLastMessage, 
        currentUser: user,
        typingUsers,
        sendTyping,
        myStatus,
        updateStatus,
        totalUnreadCount
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => useContext(ChatContext);
