'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../auth/auth-context';
import { ProtectedRoute } from '../auth/protected-route';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AnalysisItem {
  id: string;
  createdAt: string;
  geoclipPredictions?: {
    top_prediction?: {
      latitude: number;
      longitude: number;
    };
  };
}

function HistoryPageContent() {
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadAnalyses();
  }, [offset]);

  const loadAnalyses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/analysis/history?limit=${limit}&offset=${offset}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      const data = await response.json();
      setAnalyses(data.analyses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
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
            <Link href="/settings" className="text-gray-700 hover:text-blue-600 font-medium">
              Settings
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Analysis History</h1>
          <p className="text-gray-600 mt-2">View all your past analyses</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading history...</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-600 mb-4">No analyses yet</p>
            <Link href="/upload">
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">
                Upload Your First Photo
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {analyses.map((analysis) => (
              <Link key={analysis.id} href={`/results/${analysis.id}`}>
                <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-600">
                        {new Date(analysis.createdAt).toLocaleString()}
                      </p>
                      {analysis.geoclipPredictions?.top_prediction && (
                        <p className="text-gray-900 font-medium mt-2">
                          {analysis.geoclipPredictions.top_prediction.latitude.toFixed(2)}°,{' '}
                          {analysis.geoclipPredictions.top_prediction.longitude.toFixed(2)}°
                        </p>
                      )}
                    </div>
                    <span className="text-blue-600 font-medium">View →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {analyses.length > 0 && (
          <div className="mt-8 flex gap-4 justify-center">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-6 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              className="px-6 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <ProtectedRoute>
      <HistoryPageContent />
    </ProtectedRoute>
  );
}
