'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

// Types matching the existing LocationMap interface
type Location = {
  rank: number
  latitude: number
  longitude: number
  label: string
  confidence: number
}

type Props = {
  locations: Location[]
  center: [number, number]
  isProcessing?: boolean
}

// Dynamic import with SSR disabled for WebGL
const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[460px] bg-gray-900">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  ),
})

export default function GlobeMap({ locations, center, isProcessing = false }: Props) {
  const globeRef = useRef<any>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasWebGL, setHasWebGL] = useState(true)

  // WebGL detection
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) {
        setHasWebGL(false)
      }
    } catch (e) {
      setHasWebGL(false)
    }
  }, [])

  // Generate starfield texture
  const generateStarfield = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Deep space background
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Add stars
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      const size = Math.random() * 1.5
      const opacity = Math.random() * 0.8 + 0.2
      
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }

    return canvas.toDataURL()
  }

  // Prepare markers data
  const markersData = locations.map((location) => ({
    lat: location.latitude,
    lng: location.longitude,
    size: location.rank === 1 ? 1.5 : 0.8 + (location.confidence * 0.4),
    color: location.rank === 1 ? '#f59e0b' : '#3b82f6',
    label: location.label,
    confidence: location.confidence,
    rank: location.rank,
  }))

  // Prepare rings data for top prediction
  const ringsData = locations
    .filter((loc) => loc.rank === 1)
    .map((location) => ({
      lat: location.latitude,
      lng: location.longitude,
      color: '#f59e0b',
      maxAltitude: 0.5,
      propagationSpeed: 3,
      repeatPeriod: 2000,
    }))

  // Camera fly-to animation when locations load
  useEffect(() => {
    if (!globeRef.current || !isLoaded || locations.length === 0) return

    const topPrediction = locations.find((loc) => loc.rank === 1)
    if (topPrediction) {
      setTimeout(() => {
        globeRef.current?.pointOfView(
          {
            lat: topPrediction.latitude,
            lng: topPrediction.longitude,
            altitude: 1.5,
          },
          2500
        )
      }, 500)
    }
  }, [locations, isLoaded])

  // Handle marker clicks
  const handleMarkerClick = (marker: any) => {
    if (!globeRef.current) return

    globeRef.current.pointOfView(
      {
        lat: marker.lat,
        lng: marker.lng,
        altitude: 1.5,
      },
      2000
    )
  }

  // Fallback for no WebGL
  if (!hasWebGL) {
    return (
      <div className="flex items-center justify-center h-[460px] bg-gray-900 text-white">
        <p>WebGL is not supported in your browser. Please use a modern browser to view the 3D globe.</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[460px] bg-gray-900 rounded-lg overflow-hidden">
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl={generateStarfield() || undefined}
        width={800}
        height={460}
        pointsData={markersData}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointRadius="size"
        pointAltitude={0.02}
        pointLabel={(marker: any) => `
          <div style="
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            border: 1px solid ${marker.rank === 1 ? '#f59e0b' : '#3b82f6'};
          ">
            <strong>${marker.label}</strong><br/>
            Rank: ${marker.rank}<br/>
            Confidence: ${Math.round(marker.confidence * 100)}%
          </div>
        `}
        onPointClick={handleMarkerClick}
        ringsData={isProcessing ? [] : ringsData}
        ringColor={() => '#f59e0b'}
        ringMaxRadius="maxAltitude"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        atmosphereColor="#3b82f6"
        atmosphereAltitude={0.15}
        onGlobeReady={() => setIsLoaded(true)}
      />
      
      {/* Scanning beam overlay during processing */}
      {isProcessing && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-full h-full">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/10 to-transparent animate-pulse"></div>
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg">
              <p className="text-white text-sm flex items-center gap-2">
                <span className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></span>
                Analyzing...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
