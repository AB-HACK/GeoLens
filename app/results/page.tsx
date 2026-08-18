'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// This used to be the results page itself, reading a single global
// localStorage key. That broke as soon as V3 introduced per-user,
// per-analysis persistence: it couldn't show a specific past result
// and had no way to be linked to from history. Real results now live
// at /results/[id]. This route exists only to catch anyone who lands
// on the old bare /results URL and send them somewhere useful instead
// of showing a broken or stale page.
export default function ResultsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/history')
  }, [router])

  return (
    <main>
      <section className="section-card" style={{ padding: '2rem' }}>
        <p className="text-muted">Redirecting to your analysis history...</p>
      </section>
    </main>
  )
}
