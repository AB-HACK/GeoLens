'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../auth/auth-context';
import { ProtectedRoute } from '../auth/protected-route';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function SettingsPageContent() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy'>('profile');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile form
  const [email, setEmail] = useState(user?.email || '');

  // Password form
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Privacy statement
  const [privacyStatement, setPrivacyStatement] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'privacy') {
      loadPrivacyStatement();
    }
  }, [activeTab]);

  const loadPrivacyStatement = async () => {
    try {
      const response = await fetch(`${API_URL}/user/privacy`);
      if (response.ok) {
        const data = await response.json();
        setPrivacyStatement(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('Failed to load privacy statement');
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/user/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to update email');
      }

      setSuccess('Email updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update email');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword,
          newPassword,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to change password');
      }

      setSuccess('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure? This will permanently delete your account and all analyses.')) {
      return;
    }

    const password = prompt('Enter your password to confirm deletion:');
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/user/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      await logout();
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">GeoLens</h1>
          <div className="flex gap-4">
            <Link href="/upload" className="text-gray-700 hover:text-blue-600 font-medium">
              Upload
            </Link>
            <Link href="/history" className="text-gray-700 hover:text-blue-600 font-medium">
              History
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Manage your account and preferences</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              {(['profile', 'security', 'privacy'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full text-left px-4 py-3 font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab === 'profile' && '👤 Profile'}
                  {tab === 'security' && '🔒 Security'}
                  {tab === 'privacy' && '📋 Privacy'}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="md:col-span-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              {success && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-green-700">{success}</p>
                </div>
              )}

              {activeTab === 'profile' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Profile</h2>

                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Account Created
                        </label>
                        <p className="text-gray-900">
                          {user?.createdAt
                            ? new Date(user.createdAt).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateEmail} className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Update Email</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || email === user?.email}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition-colors"
                    >
                      {loading ? 'Updating...' : 'Update Email'}
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'security' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Security</h2>

                  <form onSubmit={handleChangePassword} className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !oldPassword || !newPassword || !confirmPassword}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition-colors"
                    >
                      {loading ? 'Updating...' : 'Change Password'}
                    </button>
                  </form>

                  <div className="border-t pt-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Account</h3>
                    <p className="text-gray-600 mb-4">
                      Permanently delete your account and all associated data. This cannot be undone.
                    </p>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition-colors"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'privacy' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Privacy Statement</h2>
                  {privacyStatement ? (
                    <pre className="bg-gray-50 p-4 rounded-md overflow-auto text-sm text-gray-700 max-h-96">
                      {privacyStatement}
                    </pre>
                  ) : (
                    <p className="text-gray-600">Loading privacy statement...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsPageContent />
    </ProtectedRoute>
  );
}
