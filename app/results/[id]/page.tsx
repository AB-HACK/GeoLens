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

type WeatherInfo = {
  description: string
  temperature: number
  feels_like: number
  humidity: number
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
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  imageReference: string | null
  geoclipPredictions: {
    top_prediction: PredictionLocation & { current_weather?: WeatherInfo | null }
    alternatives: PredictionLocation[]
    meta?: { model: string; version: string }
  } | null
  evidence: Evidence | null
  adjustedRanking: PredictionLocation[] | null
  createdAt: string
}

export default function ResultsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const analysisId = params?.id

  const [data, setData] = useState<ApiResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'prediction' | 'evidence' | 'comparison'>('prediction')

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

  if (data.status !== 'COMPLETED' || !data.geoclipPredictions) {
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

  // Reshape the raw DB response into the flat structure this UI was
  // originally built around (pre-V3, when results came from a single
  // localStorage blob rather than a per-analysis API fetch).
  const { top_prediction, alternatives, meta } = data.geoclipPredictions
  const result = {
    status: data.status,
    top_prediction,
    alternatives,
    current_weather: top_prediction.current_weather ?? null,
    meta,
    evidence: data.evidence ?? undefined,
    adjusted_ranking: data.adjustedRanking ?? undefined,
  }

  const allLocations = [result.top_prediction, ...result.alternatives]
  const hasEvidence = !!(
    result.evidence &&
    (result.evidence.landmarks.length > 0 ||
      result.evidence.labels.length > 0 ||
      result.evidence.ocr_text.length > 0 ||
      result.evidence.objects.length > 0)
  )

  return (
    <main>
      <section className="section-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid rgba(148, 163, 184, 0.12)', paddingBottom: '1rem' }}>
          <button
            onClick={() => setActiveTab('prediction')}
            style={{
              padding: '0.5rem 1rem',
              background: activeTab === 'prediction' ? '#3b82f6' : 'transparent',
              color: activeTab === 'prediction' ? 'white' : '#cbd5e1',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              fontSize: '1rem',
            }}
          >
            Prediction
          </button>
          {hasEvidence && (
            <button
              onClick={() => setActiveTab('evidence')}
              style={{
                padding: '0.5rem 1rem',
                background: activeTab === 'evidence' ? '#3b82f6' : 'transparent',
                color: activeTab === 'evidence' ? 'white' : '#cbd5e1',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
            >
              Evidence
            </button>
          )}
          {hasEvidence && result.adjusted_ranking && (
            <button
              onClick={() => setActiveTab('comparison')}
              style={{
                padding: '0.5rem 1rem',
                background: activeTab === 'comparison' ? '#3b82f6' : 'transparent',
                color: activeTab === 'comparison' ? 'white' : '#cbd5e1',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '1rem',
              }}
            >
              Prediction Comparison
            </button>
          )}
        </div>

        {activeTab === 'prediction' && (
          <div className="grid-2" style={{ gap: '2rem', alignItems: 'start' }}>
            <div>
              <p className="text-muted">Estimated location</p>
              <h1 className="card-title">Top predicted location</h1>
              <p style={{ marginTop: '1rem', color: '#cbd5e1', lineHeight: 1.8 }}>
                This result is an estimate from a GeoCLIP model. The top guess is shown here along with ranked alternative locations and current weather at the estimated location.
              </p>
              <div style={{ marginTop: '1.5rem' }}>
                <strong>{result.top_prediction.label}</strong>
                <p className="text-muted" style={{ marginTop: '0.6rem' }}>
                  Model confidence: {Math.round(result.top_prediction.confidence * 100)}% (not a guarantee)
                </p>
                <div className="progress-bar" style={{ marginTop: '1rem' }}>
                  <div className="progress-meter" style={{ width: `${Math.min(100, Math.round(result.top_prediction.confidence * 100))}%` }} />
                </div>
              </div>
              <div style={{ marginTop: '2rem', height: '460px' }}>
                <GlobeMap
                  locations={allLocations}
                  center={[result.top_prediction.latitude, result.top_prediction.longitude]}
                  isProcessing={false}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div className="weather-card">
                <p className="text-muted">Current weather at the estimated location</p>
                {result.current_weather ? (
                  <div>
                    <h2 style={{ margin: '0.8rem 0' }}>{result.current_weather.description}</h2>
                    <p style={{ margin: 0 }}><strong>{result.current_weather.temperature.toFixed(0)}\u00b0C</strong> feels like {result.current_weather.feels_like.toFixed(0)}\u00b0C</p>
                    <p className="text-muted" style={{ margin: '0.5rem 0 0' }}>Humidity {result.current_weather.humidity}%</p>
                  </div>
                ) : (
                  <p className="text-muted">Weather data is unavailable at the moment.</p>
                )}
              </div>
              <button className="secondary-button" onClick={() => router.push('/upload')}>
                Upload another photo
              </button>
            </div>
          </div>
        )}

        {activeTab === 'evidence' && hasEvidence && result.evidence && (
          <div>
            <h2 className="card-title">Evidence explaining the prediction</h2>
            <p className="text-muted" style={{ marginTop: '0.75rem' }}>
              Here are the visual features detected in your image that support or contextualize the geolocation prediction.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
              {result.evidence.landmarks.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Landmarks Detected</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {result.evidence.landmarks.map((landmark, idx) => (
                      <div key={idx}>
                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500 }}>{landmark.name}</p>
                        <span className="text-muted">{Math.round(landmark.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.evidence.labels.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Scene Labels</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {result.evidence.labels.map((label, idx) => (
                      <span key={idx} style={{ padding: '0.4rem 0.8rem', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.5)', borderRadius: '16px', fontSize: '0.875rem', color: '#93c5fd' }}>
                        {label.name} ({Math.round(label.confidence * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.evidence.ocr_text.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Text Detected (OCR)</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {result.evidence.ocr_text.slice(0, 10).map((text, idx) => (
                      <p key={idx} className="text-muted" style={{ margin: 0, fontSize: '0.875rem' }}>"{text}"</p>
                    ))}
                  </div>
                </div>
              )}

              {result.evidence.objects.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Objects Detected</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {result.evidence.objects.map((obj, idx) => (
                      <div key={idx}>
                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500 }}>{obj.label}</p>
                        <span className="text-muted">{Math.round(obj.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Bounding-box image overlay intentionally omitted here: the
                backend deletes the uploaded file immediately after
                processing and has no endpoint that serves it back, so
                there's no image to draw boxes on. See chat notes. */}
          </div>
        )}

        {activeTab === 'comparison' && result.adjusted_ranking && (
          <div>
            <h2 className="card-title">Prediction Comparison: GeoCLIP vs Evidence-Adjusted</h2>
            <p className="text-muted" style={{ marginTop: '0.75rem' }}>
              The left side shows the original GeoCLIP model predictions. The right side shows how the ranking changes when adjusted by detected evidence.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
              <div>
                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#93c5fd' }}>GeoCLIP Model (Original)</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {allLocations.map((location) => (
                    <div key={location.rank} style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: location.rank === 1 ? '2px solid #3b82f6' : '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>#{location.rank}</strong>
                        <span className="text-muted">{Math.round(location.confidence * 100)}%</span>
                      </div>
                      <p style={{ margin: '0.5rem 0 0', color: '#cbd5e1' }}>{location.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#10b981' }}>Evidence-Adjusted Ranking</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {result.adjusted_ranking.map((location) => (
                    <div key={location.adjusted_rank ?? location.rank} style={{ padding: '1rem', border: '1px solid rgba(107, 114, 128, 0.3)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>#{location.adjusted_rank ?? location.rank}</strong>
                        <span className="text-muted">{Math.round((location.adjusted_confidence ?? location.confidence) * 100)}%</span>
                      </div>
                      <p style={{ margin: '0.5rem 0 0', color: '#cbd5e1' }}>{location.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
