'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    if (nextFile) {
      setFile(nextFile)
    }
  }

  const saveResult = async (data: any) => {
    const item = {
      result: data,
      imagePreview: preview,
      uploadedAt: new Date().toISOString(),
    }
    localStorage.setItem('geolens_result', JSON.stringify(item))
    router.push('/results')
  }

  const pollJob = async (currentJobId: string) => {
    setStatus('Waiting on the model to finish processing...')
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      const response = await fetch(`${API_URL}/jobs/${currentJobId}`)
      if (!response.ok) {
        setStatus('Unable to fetch job status.')
        break
      }
      const data = await response.json()
      if (data.status === 'completed') {
        return saveResult(data)
      }
    }
    setStatus('Processing is still running. Please try again in a moment.')
    setLoading(false)
  }

  const handleUpload = async () => {
    if (!file) {
      setStatus('Select an image first.')
      return
    }

    setLoading(true)
    setStatus('Uploading image...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed. Please try again.')
      }

      const data = await response.json()
      if (data.status === 'pending' && data.job_id) {
        setJobId(data.job_id)
        await pollJob(data.job_id)
        return
      }

      if (data.status === 'completed') {
        await saveResult(data)
        return
      }

      setStatus('Unexpected response from the inference service.')
    } catch (error) {
      setStatus((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const canUpload = Boolean(file)

  return (
    <main>
      <section className="section-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px' }}>
            <p className="text-muted">Upload image</p>
            <h1 className="card-title">Choose a photo for GeoCLIP inference.</h1>
            <p style={{ marginTop: '1rem', color: '#cbd5e1', lineHeight: 1.8 }}>
              The model will generate estimated coordinates for the most likely location and a ranked set of alternatives. This is an estimate, not a verified location.
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="primary-button" onClick={handleUpload} disabled={!canUpload || loading}>
                {loading ? 'Processing...' : 'Submit photo'}
              </button>
              <a href="/" className="secondary-button">Back to home</a>
            </div>
            {status ? <p style={{ marginTop: '1rem', color: '#cbd5e1' }}>{status}</p> : null}
          </div>
          <div style={{ flex: '1 1 360px' }}>
            <div className="section-card" style={{ padding: '1.25rem', minHeight: '300px' }}>
              <p className="text-muted">Preview</p>
              {preview ? (
                <img src={preview} alt="Selected preview" style={{ width: '100%', borderRadius: '18px', objectFit: 'cover', maxHeight: '380px' }} />
              ) : (
                <div style={{ minHeight: '240px', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
                  Select an image to preview it here.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
