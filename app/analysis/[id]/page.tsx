'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ProtectedRoute } from '../../auth/protected-route';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const stages = [
  { name: 'Uploading', progress: 10 },
  { name: 'Running Model', progress: 30 },
  { name: 'Extracting Evidence', progress: 60 },
  { name: 'Finalizing', progress: 90 },
  { name: 'Complete', progress: 100 },
];

function ProgressPageContent() {
  const router = useRouter();
  const params = useParams();
  const analysisId = params.id as string;
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('Connecting...');
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(
          `${API_URL}/analysis/subscribe/${analysisId}`,
          { withCredentials: true }
        );

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Progress event:', data);

            if (data.stage) {
              setCurrentStage(data.stage);
            }

            if (typeof data.progress === 'number') {
              setProgress(data.progress);
            }

            // Terminal events arrive with stage set to COMPLETED/FAILED
            // rather than a separate "status" field
            if (data.stage === 'COMPLETED' || data.stage === 'FAILED') {
              setStatus(data.stage);
              if (data.stage === 'COMPLETED') {
                setProgress(100);
                timeoutId = setTimeout(() => {
                  router.push(`/results/${analysisId}`);
                }, 1500);
              } else {
                setError(data.data?.error || 'Analysis failed.');
              }
            }
          } catch (err) {
            console.error('Failed to parse SSE event:', err);
          }
        };

        eventSource.onerror = () => {
          if (eventSource?.readyState === EventSource.CLOSED) {
            console.log('SSE connection closed');
          } else {
            setError('Connection lost. Please refresh the page.');
            eventSource?.close();
          }
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [analysisId, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          Analyzing Your Photo
        </h1>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md mb-6">
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-center text-gray-600 text-sm mt-2">{progress}%</p>
            </div>

            <div className="space-y-3 mb-8">
              {stages.map((stage) => (
                <div key={stage.name} className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      progress >= stage.progress
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    }`}
                  >
                    {progress >= stage.progress && (
                      <span className="text-white text-xs">✓</span>
                    )}
                  </div>
                  <span
                    className={`text-sm ${
                      progress >= stage.progress
                        ? 'text-gray-900 font-medium'
                        : 'text-gray-600'
                    }`}
                  >
                    {stage.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-blue-700 text-sm text-center font-medium">
                {currentStage}
              </p>
            </div>

            {status === 'COMPLETED' && (
              <div className="mt-4 text-center">
                <p className="text-green-600 font-medium">✓ Analysis complete!</p>
                <p className="text-gray-600 text-sm mt-1">Redirecting to results...</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ProgressPage() {
  return (
    <ProtectedRoute>
      <ProgressPageContent />
    </ProtectedRoute>
  );
}
