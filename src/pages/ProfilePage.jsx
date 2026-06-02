import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Lock, Save, CheckCircle2, Camera, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function ProfilePage() {
  const { user, updateProfile, updatePassword, deleteAccount } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })

  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')

  const initials = form.name
    ? form.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      await updateProfile({ name: form.name, email: form.email })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save changes.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwSaved(false)

    if (!passwords.current) {
      setPwError('Please enter your current password.')
      return
    }
    if (passwords.next.length < 8) {
      setPwError('New password must be at least 8 characters long.')
      return
    }
    if (passwords.next !== passwords.confirm) {
      setPwError('Passwords do not match.')
      return
    }

    setPwSaving(true)
    try {
      await updatePassword(passwords.current, passwords.next)
      setPwSaved(true)
      setPasswords({ current: '', next: '', confirm: '' })
      setTimeout(() => setPwSaved(false), 2500)
    } catch (err) {
      setPwError(err.message || 'Failed to update password.')
    } finally {
      setPwSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (confirm('🚨 DANGER: Are you absolutely sure you want to permanently delete your account and all associated meetings/tasks? This action is IRREVERSIBLE.')) {
      try {
        await deleteAccount()
        alert('Your account has been successfully deleted.')
        navigate('/login')
      } catch (err) {
        alert(err.message || 'Failed to delete account.')
      }
    }
  }

  const handleChangePhoto = () => {
    alert("MeetFlow automatically generates sleek initials from your profile name. Update your full name below to change the initials dynamically!")
  }

  return (
    <div className="p-8 max-w-2xl space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Profile Settings</h1>
        <p className="text-muted-foreground text-sm mt-1 font-body">Manage your team identity, security passwords, and account access.</p>
      </div>

      {/* Avatar section */}
      <div className="flex items-center gap-5 p-5 bg-card border border-border rounded-xl">
        <div className="relative group cursor-pointer" onClick={handleChangePhoto}>
          <Avatar className="w-20 h-20 border border-border shadow-md">
            <AvatarFallback className="text-2xl font-display bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={18} className="text-white" />
          </div>
        </div>
        <div>
          <p className="font-display font-semibold text-foreground text-base">{user?.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 font-body">{user?.email}</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs gap-1.5 shadow-sm" onClick={handleChangePhoto}>
            <Camera size={12} /> Change photo
          </Button>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-5 shadow-sm">
        <h2 className="font-display font-semibold text-sm text-foreground flex items-center gap-2">
          <User size={15} className="text-primary" />
          Personal Information
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          {errorMsg && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-lg flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs text-muted-foreground font-semibold">Full name</Label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  className="pl-9 text-xs"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs text-muted-foreground font-semibold">Email address</Label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  className="pl-9 text-xs"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size="sm" className="gap-2 text-xs font-semibold px-4 h-9 shadow-sm" disabled={loading}>
              {saved ? (
                <>
                  <CheckCircle2 size={14} className="text-primary-foreground" />
                  Saved!
                </>
              ) : loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : (
                <>
                  <Save size={14} /> Save changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <form onSubmit={handleUpdatePassword} className="bg-card border border-border rounded-xl p-6 space-y-5 shadow-sm">
        <h2 className="font-display font-semibold text-sm text-foreground flex items-center gap-2">
          <Lock size={15} className="text-primary" />
          Change Password
        </h2>

        <div className="space-y-4">
          {pwError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 rounded-lg flex items-center gap-2 animate-fade-in">
              <AlertCircle size={14} className="shrink-0" />
              <span className="font-medium">{pwError}</span>
            </div>
          )}
          {pwSaved && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-lg flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={14} className="shrink-0" />
              <span className="font-medium">Password successfully updated!</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="current-pw" className="text-xs text-muted-foreground font-semibold">Current password</Label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="current-pw"
                type="password"
                placeholder="••••••••"
                className="pl-9 text-xs"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-pw" className="text-xs text-muted-foreground font-semibold">New password</Label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-pw"
                  type="password"
                  placeholder="Min. 8 characters"
                  className="pl-9 text-xs"
                  value={passwords.next}
                  onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw" className="text-xs text-muted-foreground font-semibold">Confirm password</Label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm-pw"
                  type="password"
                  placeholder="Re-enter new password"
                  className="pl-9 text-xs"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                />
              </div>
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm" className="gap-2 text-xs font-semibold px-4 h-9 shadow-sm" disabled={pwSaving}>
            {pwSaving ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5 text-foreground" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Updating…
              </span>
            ) : (
              <>
                <Lock size={13} /> Update password
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="bg-card border border-destructive/30 rounded-xl p-6 space-y-3 shadow-sm">
        <h2 className="font-display font-semibold text-sm text-destructive">Danger Zone</h2>
        <p className="text-xs text-muted-foreground font-body">
          Permanently delete your account and all associated data. This action is irreversible.
        </p>
        <Button variant="destructive" size="sm" className="gap-2 text-xs font-semibold px-4 h-9 shadow-sm" onClick={handleDeleteAccount}>
          Delete account
        </Button>
      </div>
    </div>
  )
}
