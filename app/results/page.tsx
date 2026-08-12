'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LocationMap from '../components/LocationMap'

type PredictionLocation = {
  rank: number
  latitude: number
  longitude: number
  label: string
  confidence: number
}

type WeatherInfo = {
  description: string
  temperature: number
  feels_like: number
  humidity: number
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
  }
  imagePreview: string | null
}

export default function ResultsPage() {
  const router = useRouter()
  const [savedResult, setSavedResult] = useState<SavedResult | null>(null)

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

  return (
    <main>
      <section className="section-card" style={{ padding: '2rem' }}>
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
      </section>

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
    </main>
  )
}
