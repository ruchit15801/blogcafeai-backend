BlogCafeAI Backend

Setup

- Create .env with PORT, MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, REDIS_URL, AUTO_GEN_ENABLED, AUTO_GEN_TIME
- Install: npm i
- Dev: npm run dev

APIs

- /api/auth
- /api/posts
- /api/categories
- /api/tags
- /api/home
- /api/newsletter/subscribe
- /api/upload/presign

Notes

- Background jobs and Redis are not used in this setup.
