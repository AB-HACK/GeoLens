'use client'

import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
}

export default function LocationMap({ locations, center }: Props) {
  useEffect(() => {
    const container = document.getElementById('geolens-map')
    if (!container) return

    container.innerHTML = ''

    const map = L.map(container, {
      center,
      zoom: 4,
      scrollWheelZoom: false,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    locations.forEach((location, index) => {
      const marker = L.circleMarker([location.latitude, location.longitude], {
        radius: location.rank === 1 ? 12 : 8,
        color: location.rank === 1 ? '#34d399' : '#60a5fa',
        fillColor: location.rank === 1 ? '#a7f3d0' : '#93c5fd',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map)

      marker.bindPopup(`Rank ${location.rank}: ${location.label}<br/>Confidence ${Math.round(location.confidence * 100)}%`)
    })

    if (locations.length > 1) {
      const bounds = L.latLngBounds(locations.map((location) => [location.latitude, location.longitude] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }

    return () => {
      map.remove()
    }
  }, [locations, center])

  return <div id="geolens-map" style={{ width: '100%', height: '460px' }} />
}
