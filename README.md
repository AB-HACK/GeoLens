# GeoLens - Geolocation Prediction Platform

**Current Version: V3 (Enterprise Multi-User Edition)**

GeoLens is a geolocation prediction platform that combines deep learning (GeoCLIP) with explainability features. Upload a photo and get: location predictions, detected landmarks/objects, evidence-adjusted rankings, and full historical analysis.

---

## Version History

### V3 - Enterprise Architecture (In Progress)
**Focus**: Multi-user system, persistent storage, async processing, staged UI progress

- ✅ **NestJS API Gateway** - RESTful orchestration service
- ✅ **PostgreSQL Database** - Persistent user & analysis storage
- ✅ **Redis + BullMQ** - Async job queue with retry logic
- ✅ **JWT Authentication** - Secure user accounts (Argon2 password hashing)
- ✅ **Server-Sent Events (SSE)** - Real-time progress tracking
- 🟡 **Job Processor** - Background analysis execution (skeleton created, full implementation needed)
- ❌ **Frontend Auth Pages** - Register, login, settings, history (to be built)
- ❌ **Integration Testing** - Full stack validation (to be built)

👉 **[See V3 Documentation](./V3_ARCHITECTURE.md)** for complete architecture details.

### V2 - Explainability Edition (Stable)
**Focus**: Why behind predictions, evidence extraction, visual explanations

- ✅ Google Cloud Vision API (landmarks, labels, OCR)
- ✅ Roboflow object detection (vehicles, signs, infrastructure)
- ✅ Evidence extraction and scoring
- ✅ Prediction comparison view
- ✅ Bounding box visualization

👉 **[See V2 Documentation](./V2_EXPLAINABILITY.md)** for setup and features.

### V1 - Base Geolocation (Archived)
**Focus**: GeoCLIP inference, mapping, weather

- GeoCLIP model predictions
- Interactive map display
- OpenWeatherMap integration

---

## V3 Quick Start

### Prerequisites
- Node.js 18+ (frontend & backend)
- Python 3.10+ (ML service)
- PostgreSQL 14+ (database)
- Redis 6+ (job queue)

### Installation

```bash
# 1. Frontend dependencies
npm install

# 2. NestJS backend
cd api && npm install && cd ..

# 3. FastAPI ML service
cd fastapi_app && pip install -r requirements.txt && cd ..
```

### Configuration

Create `api/.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/geolens
JWT_SECRET=your-secret-key-at-least-32-characters
JWT_EXPIRATION=7d
REDIS_URL=redis://localhost:6379
ML_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### Running

```bash
# Terminal 1: Frontend (port 3000)
npm run dev

# Terminal 2: NestJS API (port 3001)
cd api && npm run start:dev

# Terminal 3: FastAPI ML (port 8000)
cd fastapi_app && uvicorn main:app --reload

# Terminal 4: Redis (if not running as service)
redis-server
```

Visit http://localhost:3000

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐
│  Next.js    │────▶│  NestJS API  │
│  Frontend   │     │  (port 3001) │
│ (port 3000) │     └──────┬───────┘
└─────────────┘            │
                           ├─▶ PostgreSQL
                           ├─▶ Redis + BullMQ
                           └─▶ FastAPI (port 8000)
```

### Services

- **Frontend** (port 3000)
  - Auth pages (register/login)
  - Upload interface
  - Results display (Evidence, Prediction, Comparison tabs)
  - History & settings

- **NestJS API** (port 3001)
  - Authentication (JWT in HTTP-only cookies)
  - User management
  - Analysis job submission & orchestration
  - Real-time progress via SSE
  - History & settings endpoints

- **FastAPI ML** (port 8000)
  - GeoCLIP inference only
  - Simple endpoint: `/predict` (accepts image file, returns predictions)
  - No evidence extraction (moved to NestJS)

- **PostgreSQL**
  - Users (email, password hash)
  - Analyses (predictions, evidence, timestamps)
  - Refresh tokens

- **Redis + BullMQ**
  - Job queue for background analysis
  - Max concurrency: 2 workers
  - Retry: 3 attempts with exponential backoff

---

## API Overview

### Authentication
```
POST /auth/register          # Create account
POST /auth/login             # Login (sets HTTP-only cookie)
POST /auth/logout            # Logout
GET /auth/me                 # Current user
POST /auth/change-password   # Update password
```

### User Profile
```
GET /user/profile            # Get profile
PATCH /user/profile          # Update email
DELETE /user/account         # Delete account
GET /user/privacy            # Privacy statement
```

### Analysis
```
POST /analysis/upload              # Submit image
GET /analysis/status/:id           # Check status
GET /analysis/result/:id           # Get results
GET /analysis/history              # Paginated history
GET /analysis/subscribe/:id        # SSE progress stream
```

---

## Features by Version

| Feature | V1 | V2 | V3 |
|---------|----|----|-----|
| GeoCLIP predictions | ✅ | ✅ | ✅ |
| Landmark detection | ❌ | ✅ | ✅ |
| Object detection | ❌ | ✅ | ✅ |
| Evidence display | ❌ | ✅ | ✅ |
| Multi-user system | ❌ | ❌ | ✅ |
| Persistent storage | ❌ | ❌ | ✅ |
| Async processing | ❌ | ❌ | ✅ |
| Real-time progress UI | ❌ | ❌ | ✅ |
| History tracking | ❌ | ❌ | ✅ |
| User settings | ❌ | ❌ | ✅ |

---

## Development Status

### Completed (V3)
- ✅ NestJS API skeleton with all major endpoints
- ✅ Prisma schema for PostgreSQL
- ✅ JWT authentication system
- ✅ BullMQ job queue setup
- ✅ SSE infrastructure for real-time updates
- ✅ FastAPI refactored to ML-only service
- ✅ User profile & privacy management
- ✅ Analysis service with job orchestration

### In Progress
- 🟡 Job processor implementation (calls FastAPI, Vision API, Roboflow)
- 🟡 Frontend auth pages integration
- 🟡 History page UI
- 🟡 Settings page UI
- 🟡 SSE progress UI component

### Not Started
- ❌ Evidence extraction in NestJS (Vision/Roboflow integration)
- ❌ Frontend testing
- ❌ Backend integration tests
- ❌ Production deployment setup (Docker, CI/CD)
- ❌ Monitoring & logging infrastructure

---

## Migration from V2

If you're using V2 and want to upgrade:

1. Install V3 backend alongside V2
2. Run PostgreSQL migrations (`prisma db push`)
3. Update frontend to point to new API (port 3001)
4. Register new user account
5. Test auth flow → upload → results
6. Optionally migrate old V2 analyses (manual process)

---

## Security & Privacy

- **Passwords**: Argon2id hashing (GPU-resistant, OWASP 2023 standard)
- **Authentication**: JWT in HTTP-only cookies with SameSite=Strict
- **CORS**: Restricted to frontend URL
- **Input Validation**: All inputs validated via DTOs with whitelist
- **File Upload**: Size limits, temporary storage, auto-cleanup
- **Data Deletion**: User deletion cascades to all analyses
- **HTTPS**: Use SSL/TLS in production (set `secure: true` in cookies)

---

## Troubleshooting

**"Cannot connect to database"**
- Ensure PostgreSQL is running
- Verify DATABASE_URL in .env
- Run migrations: `cd api && npx prisma db push`

**"Job stuck in QUEUED"**
- Verify Redis is running (`redis-cli ping`)
- Check REDIS_URL configuration
- Restart NestJS

**"JWT verification failed"**
- Ensure JWT_SECRET is consistent across .env
- Check cookie domain matches FRONTEND_URL
- Clear browser cookies and re-login

**"File upload fails"**
- Verify `./api/uploads/` directory exists
- Check disk space
- Verify file size within limits (10MB default)

---

## References

- NestJS: https://docs.nestjs.com/
- Prisma: https://www.prisma.io/docs/
- BullMQ: https://docs.bullmq.io/
- GeoCLIP: https://github.com/ViT-Adapter/GeoCLIP
- FastAPI: https://fastapi.tiangolo.com/

---

**Version**: 3.0.0  
**Last Updated**: January 2024  
**Status**: Backend foundation complete, Frontend development in progress
