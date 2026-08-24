'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import GlobeMap from '../../components/GlobeMap'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type PredictionLocation = {
  rank: number
  adjusted_rank?: number
  latitude: number
  longitude: number
  label: string
  confidence: number
  adjusted_confidence?: number
  evidence_multiplier?: number
}

type Evidence = {
  landmarks: { name: string; confidence: number }[]
  labels: { name: string; confidence: number }[]
  ocr_text: string[]
  objects: { label: string; confidence: number; bbox: { x_min: number; y_min: number; x_max: number; y_max: number } }[]
  extracted_language?: string
}

type ApiResult = {
  analysisId: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED'
  imageReference: string | null
  geoclipPredictions: {
    top_prediction: PredictionLocation
    alternatives: PredictionLocation[]
    meta?: { model: string; version: string }
  } | null
  evidence: Evidence | null
  adjustedRanking: PredictionLocation[] | null
  createdAt: string
}

export default function ExplorerPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const analysisId = params?.id

  const [data, setData] = useState<ApiResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState<PredictionLocation | null>(null)

  useEffect(() => {
    if (!analysisId) return

    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/analysis/result/${analysisId}`, {
          credentials: 'include',
        })

        if (response.status === 401) {
          router.push('/auth/login')
          return
        }

        if (!response.ok) {
          throw new Error('Could not load this analysis.')
        }

        const json: ApiResult = await response.json()
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong.')
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [analysisId, router])

  if (loading) {
    return (
      <main>
        <section className="section-card" style={{ padding: '2rem' }}>
          <p className="text-muted">Loading analysis...</p>
        </section>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main>
        <section className="section-card" style={{ padding: '2rem' }}>
          <h1 className="card-title">Couldn't load this result</h1>
          <p className="text-muted">{error || 'This analysis could not be found, or you may not have access to it.'}</p>
          <button className="primary-button" onClick={() => router.push('/history')}>Back to history</button>
        </section>
      </main>
    )
  }

  if (data.status !== 'COMPLETED' && data.status !== 'COMPLETED_WITH_WARNINGS' || !data.geoclipPredictions) {
    return (
      <main>
        <section className="section-card" style={{ padding: '2rem' }}>
          <h1 className="card-title">
            {data.status === 'FAILED' ? 'This analysis failed' : 'Still processing'}
          </h1>
          <p className="text-muted">
            {data.status === 'FAILED'
              ? 'Something went wrong while analyzing this image. Try uploading again.'
              : 'This analysis hasn\u2019t finished yet. If you just submitted it, go back to watch its progress.'}
          </p>
          <button
            className="primary-button"
            onClick={() =>
              data.status === 'FAILED'
                ? router.push('/upload')
                : router.push(`/analysis/${analysisId}`)
            }
          >
            {data.status === 'FAILED' ? 'Upload another photo' : 'View progress'}
          </button>
        </section>
      </main>
    )
  }

  const { top_prediction, alternatives } = data.geoclipPredictions
  const allLocations = [top_prediction, ...alternatives]

  return (
    <main>
      <section className="section-card" style={{ padding: '2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <button
            className="secondary-button"
            onClick={() => router.push(`/results/${analysisId}`)}
            style={{ marginBottom: '1rem' }}
          >
            ← Back to Results
          </button>
          <h1 className="card-title">Map Explorer</h1>
          <p className="text-muted">
            Explore all predicted candidate locations. Click on any marker to view details.
          </p>
        </div>

        <div className="grid-2" style={{ gap: '2rem', alignItems: 'start' }}>
          <div>
            <div style={{ height: '600px' }}>
              <GlobeMap
                locations={allLocations}
                center={[top_prediction.latitude, top_prediction.longitude]}
                isProcessing={false}
              />
            </div>
          </div>

          <div>
            <h2 style={{ marginBottom: '1rem' }}>Candidate Locations</h2>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {allLocations.map((location) => (
                <div
                  key={location.rank}
                  onClick={() => setSelectedLocation(location)}
                  style={{
                    padding: '1rem',
                    background: selectedLocation?.rank === location.rank
                      ? 'rgba(59, 130, 246, 0.2)'
                      : 'rgba(59, 130, 246, 0.1)',
                    border: selectedLocation?.rank === location.rank
                      ? '2px solid #3b82f6'
                      : '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>#{location.rank}</strong>
                    <span className="text-muted">{Math.round(location.confidence * 100)}%</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0', color: '#cbd5e1' }}>{location.label}</p>
                  <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                    {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
                  </p>
                </div>
              ))}
            </div>

            {selectedLocation && (
              <div style={{ marginTop: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>
                  #{selectedLocation.rank}: {selectedLocation.label}
                </h3>
                <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 0.5rem' }}>
                    <strong>Confidence:</strong> {Math.round(selectedLocation.confidence * 100)}%
                  </p>
                  <p style={{ margin: '0 0 0.5rem' }}>
                    <strong>Coordinates:</strong> {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                  </p>
                  {selectedLocation.adjusted_confidence && (
                    <p style={{ margin: '0 0 0.5rem' }}>
                      <strong>Evidence-Adjusted Confidence:</strong> {Math.round(selectedLocation.adjusted_confidence * 100)}%
                    </p>
                  )}
                  {selectedLocation.evidence_multiplier && (
                    <p style={{ margin: 0 }}>
                      <strong>Evidence Multiplier:</strong> {selectedLocation.evidence_multiplier.toFixed(2)}x
                    </p>
                  )}
                </div>

                {data.evidence && (
                  <div style={{ marginTop: '1rem' }}>
                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Evidence Summary</h4>
                    {data.evidence.landmarks.length > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <p className="text-muted" style={{ fontSize: '0.85rem' }}>Landmarks:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {data.evidence.landmarks.slice(0, 5).map((landmark, idx) => (
                            <span
                              key={idx}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'rgba(59, 130, 246, 0.2)',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                              }}
                            >
                              {landmark.name} ({Math.round(landmark.confidence * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.evidence.labels.length > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <p className="text-muted" style={{ fontSize: '0.85rem' }}>Scene Labels:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {data.evidence.labels.slice(0, 5).map((label, idx) => (
                            <span
                              key={idx}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'rgba(16, 185, 129, 0.2)',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                              }}
                            >
                              {label.name} ({Math.round(label.confidence * 100)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
