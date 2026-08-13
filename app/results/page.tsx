'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LocationMap from '../components/LocationMap'

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

type Landmark = {
  name: string
  confidence: number
}

type Label = {
  name: string
  confidence: number
}

type BBox = {
  x_min: number
  y_min: number
  x_max: number
  y_max: number
}

type DetectedObject = {
  label: string
  confidence: number
  bbox: BBox
}

type Evidence = {
  landmarks: Landmark[]
  labels: Label[]
  ocr_text: string[]
  objects: DetectedObject[]
  extracted_language?: string
}

type SavedResult = {
  result: {
    status: string
    top_prediction: PredictionLocation
    alternatives: PredictionLocation[]
    current_weather?: WeatherInfo | null
    meta?: {
      estimated: boolean
      model_confidence: number
    }
    evidence?: Evidence
    adjusted_ranking?: PredictionLocation[]
    adjusted_top_prediction?: PredictionLocation
  }
  imagePreview: string | null
}

export default function ResultsPage() {
  const router = useRouter()
  const [savedResult, setSavedResult] = useState<SavedResult | null>(null)
  const [activeTab, setActiveTab] = useState<'prediction' | 'evidence' | 'comparison'>('prediction')
  const [imageWithBboxes, setImageWithBboxes] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('geolens_result')
    if (!stored) {
      return
    }
    try {
      setSavedResult(JSON.parse(stored))
    } catch {
      setSavedResult(null)
    }
  }, [])

  useEffect(() => {
    // Draw bounding boxes on image when evidence tab is active
    if (activeTab === 'evidence' && savedResult?.imagePreview && savedResult?.result?.evidence?.objects) {
      drawBoundingBoxes()
    }
  }, [activeTab, savedResult])

  const drawBoundingBoxes = async () => {
    if (!savedResult?.imagePreview || !savedResult?.result?.evidence?.objects) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height

      ctx.drawImage(img, 0, 0)

      // Draw bounding boxes
      const objects = savedResult.result.evidence.objects
      objects.forEach((obj, idx) => {
        const { x_min, y_min, x_max, y_max } = obj.bbox
        const x = x_min * canvas.width
        const y = y_min * canvas.height
        const width = (x_max - x_min) * canvas.width
        const height = (y_max - y_min) * canvas.height

        // Draw rectangle
        ctx.strokeStyle = `hsl(${(idx * 60) % 360}, 100%, 50%)`
        ctx.lineWidth = 3
        ctx.strokeRect(x, y, width, height)

        // Draw label
        ctx.fillStyle = `hsl(${(idx * 60) % 360}, 100%, 50%)`
        ctx.font = 'bold 14px Arial'
        const label = `${obj.label} (${Math.round(obj.confidence * 100)}%)`
        const textMetrics = ctx.measureText(label)
        ctx.fillRect(x, y - 25, textMetrics.width + 4, 20)

        ctx.fillStyle = 'white'
        ctx.fillText(label, x + 2, y - 8)
      })

      setImageWithBboxes(canvas.toDataURL())
    }
    img.src = savedResult.imagePreview
  }

  if (!savedResult) {
    return (
      <main>
        <section className="section-card" style={{ padding: '2rem' }}>
          <h1 className="card-title">No recent result found</h1>
          <p className="text-muted">Upload a photo first and then come back to view the estimated locations.</p>
          <button className="primary-button" onClick={() => router.push('/upload')}>Upload a photo</button>
        </section>
      </main>
    )
  }

  const { result, imagePreview } = savedResult
  const allLocations = [result.top_prediction, ...result.alternatives]
  const hasEvidence = result.evidence && (
    result.evidence.landmarks.length > 0 ||
    result.evidence.labels.length > 0 ||
    result.evidence.ocr_text.length > 0 ||
    result.evidence.objects.length > 0
  )

  return (
    <main>
      <section className="section-card" style={{ padding: '2rem' }}>
        {/* Tab Navigation */}
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
            <>
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
              {result.adjusted_ranking && (
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
            </>
          )}
        </div>

        {/* Prediction Tab */}
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
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div className="weather-card">
                <p className="text-muted">Current weather at the estimated location</p>
                {result.current_weather ? (
                  <div>
                    <h2 style={{ margin: '0.8rem 0' }}>{result.current_weather.description}</h2>
                    <p style={{ margin: 0 }}><strong>{result.current_weather.temperature.toFixed(0)}°C</strong> feels like {result.current_weather.feels_like.toFixed(0)}°C</p>
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

        {/* Evidence Tab */}
        {activeTab === 'evidence' && hasEvidence && (
          <div>
            <h2 className="card-title">Evidence explaining the prediction</h2>
            <p className="text-muted" style={{ marginTop: '0.75rem' }}>
              Here are the visual features detected in your image that support or contextualize the geolocation prediction.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
              {/* Landmarks */}
              {result.evidence!.landmarks.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Landmarks Detected</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {result.evidence!.landmarks.map((landmark, idx) => (
                      <div key={idx} style={{ paddingBottom: '0.75rem', borderBottom: idx < result.evidence!.landmarks.length - 1 ? '1px solid rgba(148, 163, 184, 0.12)' : 'none' }}>
                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500 }}>{landmark.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: '4px', background: 'rgba(148, 163, 184, 0.2)', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: `${Math.round(landmark.confidence * 100)}%`, background: '#10b981', borderRadius: '2px' }} />
                          </div>
                          <span className="text-muted" style={{ minWidth: '45px' }}>{Math.round(landmark.confidence * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Labels */}
              {result.evidence!.labels.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Scene Labels</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {result.evidence!.labels.map((label, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '0.4rem 0.8rem',
                          background: 'rgba(59, 130, 246, 0.2)',
                          border: '1px solid rgba(59, 130, 246, 0.5)',
                          borderRadius: '16px',
                          fontSize: '0.875rem',
                          color: '#93c5fd',
                        }}
                      >
                        {label.name} ({Math.round(label.confidence * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* OCR Text */}
              {result.evidence!.ocr_text.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Text Detected (OCR)</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {result.evidence!.ocr_text.slice(0, 10).map((text, idx) => (
                      <p
                        key={idx}
                        className="text-muted"
                        style={{ margin: 0, fontSize: '0.875rem', padding: '0.5rem', background: 'rgba(148, 163, 184, 0.05)', borderRadius: '4px' }}
                      >
                        "{text}"
                      </p>
                    ))}
                    {result.evidence!.ocr_text.length > 10 && (
                      <p className="text-muted" style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
                        ...and {result.evidence!.ocr_text.length - 10} more text elements
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Objects */}
              {result.evidence!.objects.length > 0 && (
                <div className="evidence-card" style={{ padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px' }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Objects Detected</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {result.evidence!.objects.map((obj, idx) => (
                      <div key={idx} style={{ paddingBottom: '0.75rem', borderBottom: idx < result.evidence!.objects.length - 1 ? '1px solid rgba(148, 163, 184, 0.12)' : 'none' }}>
                        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500 }}>{obj.label}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: '4px', background: 'rgba(148, 163, 184, 0.2)', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: `${Math.round(obj.confidence * 100)}%`, background: '#f59e0b', borderRadius: '2px' }} />
                          </div>
                          <span className="text-muted" style={{ minWidth: '45px' }}>{Math.round(obj.confidence * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Image with Bounding Boxes */}
            {result.evidence!.objects.length > 0 && imageWithBboxes && (
              <div style={{ marginTop: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem 0' }}>Detected Objects on Your Image</h3>
                <img
                  src={imageWithBboxes}
                  alt="Image with detected objects"
                  style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.2)' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Prediction Comparison Tab */}
        {activeTab === 'comparison' && result.adjusted_ranking && (
          <div>
            <h2 className="card-title">Prediction Comparison: GeoCLIP vs Evidence-Adjusted</h2>
            <p className="text-muted" style={{ marginTop: '0.75rem' }}>
              The left side shows the original GeoCLIP model predictions. The right side shows how the ranking changes when adjusted by detected evidence (landmarks, labels, objects, text). This demonstrates how evidence can support or contradict the initial prediction.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
              {/* Original Ranking */}
              <div>
                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#93c5fd' }}>GeoCLIP Model (Original)</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {allLocations.map((location) => (
                    <div
                      key={location.rank}
                      style={{
                        padding: '1rem',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: location.rank === 1 ? '2px solid #3b82f6' : '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong>#{location.rank}</strong>
                        <span className="text-muted">{Math.round(location.confidence * 100)}%</span>
                      </div>
                      <p style={{ margin: 0, color: '#cbd5e1' }}>{location.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence-Adjusted Ranking */}
              <div>
                <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: '#10b981' }}>Evidence-Adjusted Ranking</h3>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {result.adjusted_ranking!.map((location) => {
                    const wasRankOne = location.rank === 1
                    const rankChanged = location.adjusted_rank !== location.rank
                    return (
                      <div
                        key={location.adjusted_rank}
                        style={{
                          padding: '1rem',
                          background: rankChanged ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                          border: location.adjusted_rank === 1 ? '2px solid #10b981' : '1px solid rgba(107, 114, 128, 0.3)',
                          borderRadius: '8px',
                          opacity: rankChanged ? 1 : 0.7,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <strong>#{location.adjusted_rank}</strong>
                            {rankChanged && (
                              <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.2)', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>
                                {wasRankOne ? '↓' : '↑'} from #{location.rank}
                              </span>
                            )}
                          </div>
                          <span className="text-muted">{Math.round(location.adjusted_confidence! * 100)}%</span>
                        </div>
                        <p style={{ margin: '0.5rem 0 0 0', color: '#cbd5e1' }}>{location.label}</p>
                        <p className="text-muted" style={{ margin: '0.3rem 0 0 0', fontSize: '0.875rem' }}>
                          Evidence multiplier: {location.evidence_multiplier?.toFixed(2)}x
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(107, 114, 128, 0.1)', borderRadius: '8px', borderLeft: '4px solid #6b7280' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                <strong>Note:</strong> The evidence-adjusted ranking is based on heuristic weights applied to detected landmarks, labels, objects, and text. These weights have not been validated against a held-out test set and should be considered exploratory indicators rather than scientifically calibrated measures.
              </p>
            </div>
          </div>
        )}
      </section>

      {activeTab === 'prediction' && (
        <>
          <section className="section-card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
            <div className="map-shell" id="map-shell">
              <LocationMap
                locations={allLocations}
                center={[result.top_prediction.latitude, result.top_prediction.longitude]}
              />
            </div>
          </section>

          <section className="section-card" style={{ padding: '2rem', marginTop: '1.5rem' }}>
            <h2 className="card-title">Top ranked alternatives</h2>
            <p className="text-muted" style={{ marginTop: '0.75rem' }}>
              These are the five most likely candidate locations returned by the model.
            </p>
            <div style={{ marginTop: '1rem' }}>
              {allLocations.map((location) => (
                <div key={location.rank} style={{ padding: '1rem 0', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <strong>{location.rank}. {location.label}</strong>
                    <span className="text-muted">Confidence: {Math.round(location.confidence * 100)}%</span>
                  </div>
                  <p className="text-muted" style={{ margin: '0.5rem 0 0' }}>
                    Coordinates: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  )
}

