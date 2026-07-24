import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/auth/me').then(setProfile).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Profile</h2>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <p><strong>Name:</strong> {profile?.name ?? user?.name}</p>
        <p><strong>Username:</strong> {profile?.username ?? user?.username}</p>
        <p><strong>Role:</strong> {(profile?.role ?? user?.role ?? '').replace('_', ' ')}</p>
        {profile?.lastLoginAt && (
          <p><strong>Last login:</strong> {new Date(profile.lastLoginAt).toLocaleString()}</p>
        )}
      </div>

      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Change password</h3>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="note-banner">Password changed.</div>}
      <form onSubmit={handleSubmit}>
        <label>Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <label>New password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={4} />
        <label>Confirm new password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={4} />
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>
  );
}
