import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <section className="section-card" style={{ padding: '3rem' }}>
        <div className="grid-2" style={{ alignItems: 'center' }}>
          <div>
            <p className="text-muted">GeoLens V1</p>
            <h1 className="card-title">Estimate where a photo was taken.</h1>
            <p style={{ marginTop: '1.25rem', lineHeight: 1.8, color: '#cbd5e1' }}>
              Upload any photo and GeoLens returns the top likely locations, an interactive map, and current weather at the estimated location. Predictions are estimates from a GeoCLIP model, not verified facts.
            </p>
            <div style={{ marginTop: '2rem' }}>
              <Link href="/upload">
                <button className="primary-button">Upload a photo</button>
              </Link>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '28px' }}>
              <div style={{ width: 240, height: 320, borderRadius: '24px', background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(148,163,184,0.18)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Upload your photo and see the estimated locations.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card" style={{ padding: '2rem', marginTop: '2rem' }}>
        <div className="grid-3">
          <div>
            <h2 className="card-title">1. Upload a photo</h2>
            <p className="text-muted">Choose any image and GeoLens will analyze visual cues to generate likely locations.</p>
          </div>
          <div>
            <h2 className="card-title">2. Review results</h2>
            <p className="text-muted">See the most likely location, alternative candidates, and a model confidence indicator.</p>
          </div>
          <div>
            <h2 className="card-title">3. Explore on a map</h2>
            <p className="text-muted">Plot the top predictions on an interactive map and check current weather at the estimated location.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
