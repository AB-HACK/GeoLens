# GeoLens V3: Enterprise Architecture with Multi-User Support

## Overview

GeoLens V3 extends the explainability features of V2 into a complete, enterprise-grade, multi-user geolocation prediction platform. The architecture follows a modern microservices pattern with:

- **NestJS API Gateway** (port 3001) - Orchestration, authentication, job queue, business logic
- **FastAPI ML Service** (port 8000) - GeoCLIP inference only
- **PostgreSQL** - Persistent storage for users, analyses, and results
- **Redis + BullMQ** - Async job queue for long-running analysis tasks
- **Next.js Frontend** (port 3000) - React UI with SSE-based progress tracking

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (port 3000)                 │
│  - Auth pages (register, login)                                 │
│  - Upload page with drag-drop                                  │
│  - Progress UI with SSE (real-time updates)                    │
│  - Results page (V2 features: Evidence, Prediction Comparison)  │
│  - History page (paginated analyses)                           │
│  - Settings page (profile, privacy, password)                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP/HTTPS
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│           NestJS API Gateway (port 3001)                         │
├──────────────────────────────────────────────────────────────────┤
│ REST Endpoints:                                                  │
│  • POST /auth/register - User registration                      │
│  • POST /auth/login - HTTP-only cookie session                  │
│  • POST /auth/logout - Clear session                            │
│  • GET /auth/me - Current user (protected)                      │
│  • POST /auth/change-password - Update password (protected)     │
│  • GET /user/profile - User settings (protected)                │
│  • PATCH /user/profile - Update email (protected)               │
│  • DELETE /user/account - Delete account (protected)            │
│  • GET /user/privacy - Privacy statement (public)               │
│  • POST /analysis/upload - Submit image for analysis (protected)│
│  • GET /analysis/status/{id} - Check job status (protected)     │
│  • GET /analysis/result/{id} - Get final results (protected)    │
│  • GET /analysis/history - Paginated history (protected)        │
│  • GET /analysis/subscribe/{id} - SSE progress stream (protected)
│                                                                  │
│ Core Services:                                                  │
│  • AuthService - JWT, password hashing, user auth              │
│  • UserService - Profile & privacy management                  │
│  • AnalysisService - Job orchestration, persistence            │
│  • AnalysisProcessor - Background job execution                │
│  • PrismaService - Database connection pool                    │
├──────────────────────────────────────────────────────────────────┤
│ Infrastructure:                                                  │
│  • BullMQ Job Queue (Redis-backed)                              │
│  • SSE Connections Map (real-time progress)                     │
│  • File upload storage (./uploads/)                             │
└────────────────────┬────────────────────────────────────────────┘
         │                                    │
         │ HTTP to ML service                │ Prisma ORM
         ↓                                    ↓
    ┌─────────────┐                  ┌──────────────────┐
    │  FastAPI    │                  │    PostgreSQL    │
    │  (port 8000)│                  │  (Primary Store) │
    │             │                  │                  │
    │ /predict    │                  │ Users table      │
    │ /health     │                  │ Analyses table   │
    │ /           │                  │ RefreshTokens    │
    └─────────────┘                  └──────────────────┘
                                            ↑
                                            │ Redis connection
                                            ↓
                                      ┌──────────────┐
                                      │    Redis     │
                                      │  (Job Queue) │
                                      └──────────────┘
```

## Component Details

### 1. Authentication Layer

#### Endpoints:
- `POST /auth/register` - Create new user account
  - Body: `{ email: string, password: string }`
  - Response: `{ id, email, createdAt }`
  - Hash: Argon2id (memory=65540, iterations=3)

- `POST /auth/login` - Authenticate and create session
  - Body: `{ email: string, password: string }`
  - Response: `{ id, email, createdAt }`
  - Sets: HTTP-only cookie `access_token` (7-day expiration)

- `POST /auth/logout` - Destroy session
  - Clears `access_token` cookie

- `GET /auth/me` - Get current authenticated user
  - Protected: Requires valid JWT in cookie or Bearer header
  - Response: `{ id, email, createdAt, updatedAt }`

- `POST /auth/change-password` - Update password
  - Protected: Requires authentication
  - Body: `{ oldPassword: string, newPassword: string }`
  - Validation: Verifies old password before change

#### JWT Implementation:
- Algorithm: HS256 (HMAC SHA-256)
- Secret: `JWT_SECRET` environment variable
- Expiration: `JWT_EXPIRATION` (default: 7 days)
- Payload: `{ sub: userId, iat, exp, email }`
- Cookie: `access_token`, httpOnly, secure (production), sameSite: strict
- Extraction: From cookies first, then Bearer header

#### Password Security:
- Hash: Argon2id (OWASP 2023 standard)
- No plaintext storage
- Salt: Auto-generated per hash

### 2. User Management

#### Profile Endpoints:
- `GET /user/profile` - Fetch user profile
  - Protected: Requires authentication
  - Response: `{ id, email, createdAt, updatedAt }`

- `PATCH /user/profile` - Update email
  - Protected: Requires authentication
  - Body: `{ email: string }`
  - Validation: Unique email constraint

- `DELETE /user/account` - Delete account permanently
  - Protected: Requires authentication
  - Body: `{ password: string }`
  - Cascade: Deletes all user's analyses and refresh tokens
  - Validation: Password verification required

- `GET /user/privacy` - Get privacy statement
  - Public endpoint
  - Returns: Structured privacy documentation

#### Privacy Statement Sections:
1. **What Data We Store**
   - User email and hashed password
   - Uploaded images (stored until analysis complete, then deleted)
   - Analysis metadata (predictions, evidence, timestamps)
   - Last login timestamp

2. **Why We Store It**
   - Email: Account authentication and identification
   - Password hash: Secure authentication (Argon2id, not reversible)
   - Images: Temporary processing (deleted after analysis)
   - Analysis data: Historical records for user review

3. **Data Access & Security**
   - HTTPS/TLS encryption in transit
   - Database encryption at rest (handled by provider)
   - No sharing with third parties
   - Only user and GeoLens admin access

4. **Data Deletion**
   - User can delete account: Removes all data permanently
   - Analyses deletion: Custom endpoint for selective deletion
   - GDPR compliance: Data export available on request

5. **Important Limitations**
   - No guarantees on prediction accuracy (heuristic scoring)
   - Server logs may contain debug info (retention: 30 days)
   - Backup systems may retain deleted data (90-day retention)
   - ML models are not updated per-user (global model)

### 3. Analysis Submission & Job Queue

#### Upload Endpoint:
```
POST /analysis/upload
Content-Type: multipart/form-data

file: <image file>

Response:
{
  "success": true,
  "analysisId": "cuid-string",
  "jobId": "uuid-string",
  "status": "QUEUED"
}
```

#### Job Queue Architecture (BullMQ + Redis):
- **Queue Name**: `analysis`
- **Concurrency**: 2 workers (configurable)
- **Retries**: 3 attempts with exponential backoff (2s base)
- **Timeout**: 30 minutes per job
- **Storage**: Redis (configurable via `REDIS_URL`)

#### Job Data Structure:
```typescript
{
  analysisId: string;     // Unique analysis record ID
  userId: string;         // Owner user ID
  imagePath: string;      // Disk path to uploaded image
  imageFilename: string;  // Original filename
}
```

#### Job States:
- **QUEUED**: Waiting in queue
- **PROCESSING**: Active processing
- **COMPLETED**: Finished with results
- **FAILED**: Error occurred
- **RETRYING**: Automatic retry

### 4. Job Processing Pipeline

#### AnalysisProcessor (@Processor('analysis')):

The job processor executes in background workers:

```
1. Read Image (10%)
   └─ Load image file from disk

2. Run GeoCLIP Model (30%)
   └─ Call FastAPI /predict
   └─ Get: top_prediction + alternatives (top-5 with confidences)

3. Extract Evidence (60%)
   └─ [Placeholder for Vision/Roboflow integration]
   └─ Would call: Google Cloud Vision (landmarks, labels, OCR)
   └─ Would call: Roboflow (object detection)
   └─ Get: Evidence { landmarks, labels, ocr_text, objects }

4. Combine & Score (80%)
   └─ Apply heuristic multiplier to GeoCLIP predictions
   └─ Generate adjustedRanking with evidenceMultiplier

5. Persist Results (95%)
   └─ Save to PostgreSQL via Prisma
   └─ Update Analysis.status = "COMPLETED"
   └─ Store geoclipPredictions, evidence, adjustedRanking

6. Complete (100%)
   └─ Job marked as success
   └─ Clean up temporary files

Error Handling:
└─ Any error → Job.status = "FAILED"
└─ Error message persisted
└─ Automatic cleanup of temp files
└─ Retry logic handled by BullMQ
```

#### Progress Events (SSE):

During processing, events are emitted at each stage:

```
{
  "analysisId": "abc123",
  "stage": "UPLOADING" | "RUNNING_MODEL" | "EXTRACTING_EVIDENCE" | "COMPLETE",
  "data": { ... stage-specific info ... },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Frontend subscribes to `GET /analysis/subscribe/{analysisId}` and receives these events in real-time.

### 5. Database Schema (Prisma + PostgreSQL)

#### User Model:
```typescript
model User {
  id              String      @id @default(cuid())
  email           String      @unique
  passwordHash    String
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  analyses        Analysis[]
  refreshTokens   RefreshToken[]
}
```

#### Analysis Model:
```typescript
model Analysis {
  id                  String      @id @default(cuid())
  userId              String
  user                User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  imageReference      String      // Filename stored in ./uploads/
  imageBase64         String?     // Optional: Base64 for quick display
  
  geoclipPredictions  Json        // { top_prediction, alternatives, meta }
  evidence            Json        // { landmarks, labels, ocr_text, objects }
  adjustedRanking     Json        // { rank-adjusted predictions with scores }
  
  status              String      @default("COMPLETED") // QUEUED, PROCESSING, COMPLETED, FAILED
  error               String?     // Error message if FAILED
  jobId               String      @unique             // BullMQ job ID for reference
  
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  
  @@index([userId])
  @@index([jobId])
}
```

#### RefreshToken Model:
```typescript
model RefreshToken {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  token       String    @unique
  expiresAt   DateTime
  createdAt   DateTime  @default(now())
  
  @@index([userId])
}
```

### 6. File Upload & Storage

#### Upload Handling:
- **Endpoint**: `POST /analysis/upload`
- **Interceptor**: `FileInterceptor('file')`
- **Storage**: `./api/uploads/{userId}/{analysisId}.jpg`
- **Cleanup**: Automatic after processing or on error
- **Size Limit**: Configurable via NestJS (default: 10MB)

#### Image Processing:
- Stored temporarily during analysis
- Deleted after successful completion
- Deleted on job failure
- Not retained for privacy

### 7. Server-Sent Events (SSE)

#### Subscription Endpoint:
```
GET /analysis/subscribe/{analysisId}
Authorization: Bearer <JWT>

Response (text/event-stream):
data: {"analysisId":"...", "stage":"UPLOADING", ...}

```

#### Connection Management:
- Connections stored in `Map<analysisId, Response>`
- Keep-alive ping every 30 seconds (`:keepalive\n\n`)
- Auto-cleanup on client disconnect
- Per-connection authorization (verified user owns analysis)

#### Event Format:
```json
{
  "analysisId": "cuid-string",
  "stage": "UPLOADING|RUNNING_MODEL|EXTRACTING_EVIDENCE|COMPLETE",
  "data": { /* stage-specific payload */ },
  "timestamp": "ISO-8601 timestamp"
}
```

### 8. Frontend Integration

#### V3 Pages Required:

**Auth Pages:**
- `/auth/register` - Email/password registration form
- `/auth/login` - Email/password login form
- Session: HTTP-only cookie + JWT verification

**Main Application:**
- `/upload` - File upload (drag-drop)
  - Calls: `POST /analysis/upload`
  - Returns: `analysisId`
  - Redirects to progress page

- `/analysis/{analysisId}` - Progress tracking
  - Subscribes: `GET /analysis/subscribe/{analysisId}` (SSE)
  - Shows: Staged progress (0%, 25%, 50%, 75%, 100%)
  - On complete: Redirects to `/results/{analysisId}`

- `/results/{analysisId}` - Results display
  - Calls: `GET /analysis/result/{analysisId}` (once loaded)
  - Shows: 3-tab interface (Prediction, Evidence, Comparison) - **from V2**
  - Features: Bounding boxes, evidence cards, ranking comparison

- `/history` - Analysis history
  - Calls: `GET /analysis/history?limit=20&offset=0`
  - Shows: Paginated list of past analyses
  - Each item: Thumbnail, top prediction, timestamp
  - Click to view full results

- `/settings` - User settings
  - Sections:
    - Profile (email, createdAt, updated date)
    - Change password (requires current password)
    - Privacy statement (from `GET /user/privacy`)
    - Delete account (confirmation required)

#### V2 Features (Preserved in V3):
- Evidence extraction and display
- Bounding box visualization
- Prediction comparison view
- Same UI components and styling

## Setup & Deployment

### Prerequisites:
- Node.js 18+ (for Next.js and NestJS)
- Python 3.10+ (for FastAPI)
- PostgreSQL 14+
- Redis 6+

### Environment Setup:

**Root Directory (.env):**
```
# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001

# NestJS (api/.env)
DATABASE_URL=postgresql://user:password@localhost:5432/geolens
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRATION=7d
REDIS_URL=redis://localhost:6379
ML_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
OPENWEATHERMAP_API_KEY=your-api-key

# FastAPI (fastapi_app/.env)
# (No env vars required for V3 ML-only service)
```

### Quick Start:

```bash
# 1. Install dependencies
npm install                  # Frontend
cd api && npm install        # NestJS
cd ../fastapi_app
pip install -r requirements.txt  # FastAPI

# 2. Set up database
cd api
npx prisma db push           # Create schema
npx prisma generate          # Generate client

# 3. Start services (in separate terminals)
npm run dev                  # Frontend (port 3000)
cd api && npm run start:dev  # NestJS (port 3001)
cd fastapi_app
uvicorn main:app --reload   # FastAPI (port 8000)

# 4. Redis (must be running)
# Docker: docker run -d -p 6379:6379 redis
# Or: redis-server
```

### Production Deployment:

1. **Build Frontend**: `npm run build && npm start`
2. **Build NestJS**: `npm run build && npm run start:prod`
3. **Start FastAPI**: `gunicorn main:app --workers=4`
4. **Database**: Run migrations via `prisma migrate deploy`
5. **Redis**: Deploy managed Redis (AWS ElastiCache, etc.)
6. **SSL**: Enable HTTPS via reverse proxy (Nginx, Caddy)

## Migration from V2 to V3

### For Existing V2 Users:

1. **Backup V2 data** (SQLite database)
2. **Install V3 backend** alongside V2
3. **Run PostgreSQL migrations** via Prisma
4. **Data migration** (optional, V2 analyses not auto-migrated)
5. **Update frontend** to point to new API (port 3001)
6. **Test** auth flow, upload, results display
7. **Decommission V2** services

### What Changes:

- **Multi-user system**: All analyses now tied to user accounts
- **Persistent storage**: PostgreSQL instead of SQLite
- **Async processing**: Background jobs with progress UI
- **SSE progress**: Real-time stage updates (not available in V2)
- **New features**: History page, settings, privacy statement

### What Stays the Same:

- **Evidence extraction**: Same V2 logic (moving to NestJS)
- **Results UI**: 3-tab interface (Prediction, Evidence, Comparison)
- **Geolocation predictions**: Same GeoCLIP model

## Monitoring & Maintenance

### Logs:

- **NestJS**: `console.log()` output in terminal
- **FastAPI**: `uvicorn` logs for requests
- **Jobs**: BullMQ job logs in Redis (queryable via UI)
- **Database**: PostgreSQL logs (pg_log directory)

### Health Checks:

- `GET /analysis/health` - NestJS API health (from app.module)
- `GET http://localhost:8000/health` - FastAPI ML service health

### Performance Tuning:

- **Job Workers**: Set `BULL_CONCURRENCY` (default: 2)
- **DB Connections**: Adjust `DATABASE_URL` pool size
- **Redis Memory**: Monitor with `redis-cli INFO memory`
- **File Cleanup**: Implement scheduled cleanup of old uploads

## Security Considerations

1. **Authentication**: JWT in HTTP-only cookies (CSRF protected via SameSite)
2. **Authorization**: User ownership verified on all protected endpoints
3. **Password**: Argon2id with salts (GPU-resistant)
4. **CORS**: Restricted to frontend URL (configurable)
5. **File Upload**: Size limits, type checking (content-type validation)
6. **Secrets**: All env vars (JWT_SECRET, DATABASE_URL, etc.) never in code
7. **HTTPS**: Use SSL/TLS in production (set `secure: true` in cookie config)
8. **Input Validation**: `ValidationPipe` on all DTOs with whitelist and transform

## Testing

### Unit Tests:
- `AuthService`: Registration, login, password changes
- `UserService`: Profile updates, account deletion
- `AnalysisService`: Job submission, status queries

### Integration Tests:
- Full auth flow: Register → Login → Upload → Results → Logout
- Protected endpoints: Verify 401 without token
- User isolation: Verify users can't access other users' analyses
- Job queue: Submit job, subscribe SSE, verify completion

### End-to-End Tests:
- Upload image → Check progress → View results
- History pagination → Click → View old results
- Change password flow
- Delete account (verify cascading deletion)

## Troubleshooting

### Common Issues:

**"JWT verification failed"**
- Ensure JWT_SECRET matches between auth.service and jwt.strategy
- Check cookie domain (must match FRONTEND_URL)

**"Database connection refused"**
- Verify PostgreSQL is running
- Check DATABASE_URL syntax
- Ensure migrations are applied: `prisma db push`

**"Job stuck in QUEUED"**
- Verify Redis is running
- Check `REDIS_URL` configuration
- Restart NestJS (clears stale connections)

**"SSE not updating frontend"**
- Verify browser supports EventSource
- Check CORS headers in NestJS
- Ensure subscription URL is correct

**"File upload fails"**
- Check `./api/uploads/` directory exists and is writable
- Verify file size within limits (default 10MB)
- Check disk space

## Future Enhancements

1. **Real Evidence Integration**: Full Google Vision + Roboflow in AnalysisProcessor
2. **Batch Analysis**: Queue multiple images, get results CSV
3. **Model Versioning**: Support multiple GeoCLIP models, switchable per-user
4. **Advanced Analytics**: Dashboard showing user stats, popular locations
5. **Webhooks**: Notify external systems when analysis completes
6. **API Rate Limiting**: Per-user quotas for upload frequency
7. **Advanced Filtering**: Search/filter history by location, date range
8. **Collaboration**: Share analyses with other users (read-only)
9. **Custom Models**: Fine-tune GeoCLIP on domain-specific data
10. **Mobile App**: React Native client with offline support

## References

- NestJS Docs: https://docs.nestjs.com/
- Prisma Docs: https://www.prisma.io/docs/
- BullMQ Docs: https://docs.bullmq.io/
- FastAPI Docs: https://fastapi.tiangolo.com/
- GeoCLIP: https://github.com/ViT-Adapter/GeoCLIP
- Argon2: https://github.com/P-H-C/phc-winner-argon2

---

**Version**: 3.0.0  
**Last Updated**: January 2024  
**Status**: Backend complete, Frontend development in progress
