import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from './auth/auth-context'

export const metadata: Metadata = {
  title: 'GeoLens',
  description: 'Estimate where a photo was taken using GeoCLIP and visualize likely locations.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
