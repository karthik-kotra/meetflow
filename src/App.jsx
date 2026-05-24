import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { MeetingsProvider } from '@/context/MeetingsContext'
import { ChatProvider } from '@/context/ChatContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppLayout from '@/components/AppLayout'

import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import Dashboard from '@/pages/Dashboard'
import MeetingsPage from '@/pages/MeetingsPage'
import OngoingMeetingsPage from '@/pages/OngoingMeetingsPage'
import CreateMeetingPage from '@/pages/CreateMeetingPage'
import MeetingRoomPage from '@/pages/MeetingRoomPage'
import ProfilePage from '@/pages/ProfilePage'
import ChatPage from '@/pages/ChatPage'
import WorkspacePage from '@/pages/WorkspacePage'
import { WorkspaceProvider } from '@/context/WorkspaceContext'

export default function App() {
  return (
    <AuthProvider>
      <MeetingsProvider>
        <ChatProvider>
          <WorkspaceProvider>
            <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Protected – with sidebar layout */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/ongoing-meetings" element={<OngoingMeetingsPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/create-meeting" element={<CreateMeetingPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/workspaces" element={<WorkspacePage />} />
                <Route path="/workspace/:id" element={<WorkspacePage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              {/* Meeting room – protected, full-screen (no sidebar) */}
              <Route
                path="/meeting/:id"
                element={
                  <ProtectedRoute>
                    <MeetingRoomPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            </BrowserRouter>
          </WorkspaceProvider>
        </ChatProvider>
      </MeetingsProvider>
    </AuthProvider>
  )
}
