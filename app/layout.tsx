import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GeoLens',
  description: 'Estimate where a photo was taken using GeoCLIP and visualize likely locations.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
