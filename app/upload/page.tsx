'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/auth-context';
import { ProtectedRoute } from '../auth/protected-route';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function UploadPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (nextFile) {
      setError(null);
      if (!nextFile.type.startsWith('image/')) {
        setError('Please select an image file');
        setFile(null);
        return;
      }
      if (nextFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        setFile(null);
        return;
      }
      setFile(nextFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Select an image first');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/analysis/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      const data = await response.json();
      if (data.analysisId) {
        // Redirect to progress page
        router.push(`/analysis/${data.analysisId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const canUpload = Boolean(file);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">GeoLens</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">{user?.email}</span>
            <Link href="/history" className="text-gray-700 hover:text-blue-600 font-medium">
              History
            </Link>
            <Link href="/settings" className="text-gray-700 hover:text-blue-600 font-medium">
              Settings
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Upload Photo</h1>
            <p className="text-lg text-gray-600 mb-6">
              Choose a photo and GeoLens will analyze it to predict the location using advanced AI.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="mb-6 border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-white hover:bg-blue-50 transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-input"
                disabled={loading}
              />
              <label htmlFor="file-input" className="cursor-pointer">
                <div className="text-4xl mb-2">📸</div>
                <p className="text-gray-900 font-semibold mb-1">
                  {file ? file.name : 'Click to select or drag and drop'}
                </p>
                <p className="text-gray-600 text-sm">PNG, JPG, GIF up to 10MB</p>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={!canUpload || loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                {loading ? 'Uploading...' : 'Analyze Photo'}
              </button>
              <Link href="/">
                <button className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Back
                </button>
              </Link>
            </div>
          </div>

          <div>
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-4">
              <p className="text-sm text-gray-600 mb-2">PREVIEW</p>
              <div className="w-full aspect-square rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                {preview ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-gray-400">
                    <div className="text-4xl mb-2">🖼️</div>
                    <p>Select an image to preview</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <ProtectedRoute>
      <UploadPageContent />
    </ProtectedRoute>
  );
}
