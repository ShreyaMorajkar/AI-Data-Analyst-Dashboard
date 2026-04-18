require('dotenv').config({ override: true })

const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const multer = require('multer')
const rateLimit = require('express-rate-limit')
const { getPreferredAiProvider, planAnalysisSql, generateInsightsAndChart } = require('./ai')
const { buildOverview, buildSuggestionChips } = require('./analysis')
const { profileCsv, executeSqlAnalysis, pingPythonService } = require('./pythonService')
const { connectToDatabase, getDatabaseStatus, getLastDatabaseError, hasDatabaseConfig, isDatabaseEnabled } = require('./db')
const AnalysisSession = require('./models/AnalysisSession')
const BoardSnapshot = require('./models/BoardSnapshot')
const User = require('./models/User')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { isEmailVerificationConfigured, sendVerificationEmail, getEmailVerificationStatus } = require('./mailer')

const JWT_SECRET = process.env.JWT_SECRET
const PORT = process.env.PORT || 5050
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_QUESTION_LENGTH = 500
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_request, file, callback) => {
    const allowedMimes = new Set([
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ])
    const isCsvMime = !file.mimetype || allowedMimes.has(file.mimetype)
    const isCsvExtension = /\.csv$/i.test(file.originalname || '')
    if (isCsvMime || isCsvExtension) {
      callback(null, true)
      return
    }

    callback(new Error('Only CSV files are supported.'))
  },
})
const app = express()
const sessions = new Map()
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many upload attempts. Please wait a few minutes and try again.',
  },
})
const analyzeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many analysis requests in a short period. Please slow down and retry.',
  },
})
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const EMAIL_VERIFICATION_DISABLED = String(process.env.EMAIL_VERIFICATION_DISABLED || '').toLowerCase() === 'true'

function corsOriginHandler(origin, callback) {
  // Allow any local Vite origin without having to keep FRONTEND_ORIGIN in sync with ports.
  // Safe: browsers can only send these origins if the page is actually running locally.
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    callback(null, true)
    return
  }

  if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
    callback(null, true)
    return
  }

  callback(new Error('Origin is not allowed by CORS policy.'))
}

function sessionCacheKey(userId, sessionId) {
  return `${userId}:${sessionId}`
}

async function hydrateSession(userId, sessionId) {
  const cacheKey = sessionCacheKey(userId, sessionId)
  if (sessions.has(cacheKey)) {
    return sessions.get(cacheKey)
  }

  if (!isDatabaseEnabled()) {
    return null
  }

  const persistedSession = await AnalysisSession.findOne({ sessionId, userId }).lean()
  if (!persistedSession) {
    return null
  }

  const hydrated = {
    profile: persistedSession.profile,
    filename: persistedSession.filename,
  }

  sessions.set(cacheKey, hydrated)
  return hydrated
}

function requireJwtSecret(response) {
  if (!JWT_SECRET) {
    response.status(500).json({ error: 'Server auth is not configured. Set JWT_SECRET.' })
    return false
  }
  return true
}

function getBearerToken(request) {
  const authHeader = request.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice('Bearer '.length).trim()
}

function requireAuth(request, response, next) {
  if (!requireJwtSecret(response)) {
    return
  }

  const token = getBearerToken(request)
  if (!token) {
    response.status(401).json({ error: 'Missing authentication token.' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (!decoded?.id) {
      response.status(401).json({ error: 'Invalid authentication token.' })
      return
    }
    request.authUserId = String(decoded.id)
    next()
  } catch (_error) {
    response.status(401).json({ error: 'Invalid or expired authentication token.' })
  }
}

app.set('trust proxy', 1)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
)
app.use(
  cors({
    origin: corsOriginHandler,
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', async (_request, response) => {
  const pythonServiceReachable = await pingPythonService()
  const databaseStatus = getDatabaseStatus()
  const aiProvider = getPreferredAiProvider()
  response.json({
    ok: true,
    database: isDatabaseEnabled(),
    databaseStatus,
    databaseError: databaseStatus === 'configured' ? getLastDatabaseError() : null,
    persistence: isDatabaseEnabled() ? 'mongodb' : 'memory',
    aiConfigured: aiProvider !== 'none',
    aiProvider,
    pythonService: pythonServiceReachable ? 'online' : 'offline',
    emailVerification: getEmailVerificationStatus(),
    emailVerificationDisabled: EMAIL_VERIFICATION_DISABLED,
    maxUploadMb: Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024)),
    questionLimit: MAX_QUESTION_LENGTH,
    allowedOrigins,
  })
})

app.post('/api/auth/register', async (request, response) => {
  const { email, password } = request.body ?? {}
  if (!email || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }

  if (!isDatabaseEnabled()) {
    return response.status(503).json({ error: 'Registration requires MongoDB to be configured and connected.' })
  }
  if (!requireJwtSecret(response)) {
    return
  }
  if (!EMAIL_VERIFICATION_DISABLED && !isEmailVerificationConfigured()) {
    return response.status(500).json({
      error:
        'Email verification is not configured. Set FRONTEND_VERIFY_URL. For production, also set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.',
    })
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase()
    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      return response.status(400).json({ error: 'An account with this email already exists.' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const verificationToken = EMAIL_VERIFICATION_DISABLED ? null : crypto.randomBytes(32).toString('hex')
    const verificationTokenHash = verificationToken
      ? crypto.createHash('sha256').update(verificationToken).digest('hex')
      : null
    const verificationExpiry = verificationToken ? new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) : null

    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      isEmailVerified: EMAIL_VERIFICATION_DISABLED,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationExpiresAt: verificationExpiry,
      emailVerifiedAt: EMAIL_VERIFICATION_DISABLED ? new Date() : null,
    })

    const mailInfo = verificationToken
      ? await sendVerificationEmail({
          toEmail: user.email,
          verificationToken,
        })
      : null

    const payload = {
      message: EMAIL_VERIFICATION_DISABLED
        ? 'Account created. Email verification is disabled for this environment.'
        : 'Account created. Check your email to verify your account before logging in.',
    }
    if (process.env.NODE_ENV !== 'production') {
      payload.dev = mailInfo
    }

    return response.status(201).json(payload)
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Registration failed.' })
  }
})

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body ?? {}
  if (!email || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }

  if (!isDatabaseEnabled()) {
    return response.status(503).json({ error: 'Login requires MongoDB to be configured and connected.' })
  }
  if (!requireJwtSecret(response)) {
    return
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase()
    const user = await User.findOne({ email: normalizedEmail })
    if (!user) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }
    if (!EMAIL_VERIFICATION_DISABLED && !user.isEmailVerified) {
      return response.status(403).json({ error: 'Verify your email before logging in.' })
    }
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })
    return response.json({ message: 'Login successful.', token })
  } catch (error) {
    return response.status(500).json({ error: 'Login failed.' })
  }
})

app.post('/api/auth/verify-email', async (request, response) => {
  const { token } = request.body ?? {}
  if (!token) {
    return response.status(400).json({ error: 'Verification token is required.' })
  }
  if (!isDatabaseEnabled()) {
    return response.status(503).json({ error: 'Email verification requires MongoDB to be configured and connected.' })
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')
    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() },
    })

    if (!user) {
      return response.status(400).json({ error: 'Verification token is invalid or expired.' })
    }

    user.isEmailVerified = true
    user.emailVerifiedAt = new Date()
    user.emailVerificationTokenHash = null
    user.emailVerificationExpiresAt = null
    await user.save()

    return response.json({ message: 'Email verified successfully. You can now sign in.' })
  } catch (error) {
    return response.status(500).json({ error: 'Email verification failed.' })
  }
})

app.post('/api/upload', requireAuth, uploadLimiter, upload.single('file'), async (request, response) => {
  if (!request.file) {
    return response.status(400).json({ error: 'Please attach a CSV file.' })
  }

  try {
    const csvText = request.file.buffer.toString('utf-8')
    const sessionId = crypto.randomUUID()
    const pythonResult = await profileCsv(csvText, request.file.originalname, sessionId)
    const profile = {
      id: sessionId,
      ...pythonResult.profile,
    }

    if (!profile.rowCount) {
      return response.status(400).json({ error: 'The CSV file did not contain any usable rows.' })
    }

    sessions.set(sessionCacheKey(request.authUserId, sessionId), { profile, filename: request.file.originalname })

    const starterAnalysis = {
       ...buildOverview(profile),
       suggestionChips: pythonResult.suggestionChips ?? buildSuggestionChips(profile),
    }

    if (isDatabaseEnabled()) {
      await AnalysisSession.findOneAndUpdate(
        { sessionId, userId: request.authUserId },
        {
          userId: request.authUserId,
          sessionId,
          filename: request.file.originalname,
          profile,
          messages: [
            {
              role: 'assistant',
              content: `Dataset ${request.file.originalname} uploaded successfully.`,
            },
          ],
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    }

    return response.json({
      sessionId,
      filename: request.file.originalname,
      profile,
      initialAnalysis: starterAnalysis,
    })
  } catch (error) {
    return response.status(400).json({
      error: 'Unable to parse that CSV file. Please check the headers and formatting.',
      details: error.message,
    })
  }
})

app.post('/api/analyze', requireAuth, analyzeLimiter, async (request, response) => {
  const { sessionId, question } = request.body ?? {}
  const normalizedQuestion = String(question ?? '').trim()
  if (!sessionId) {
    return response.status(404).json({ error: 'Upload a CSV file before asking questions.' })
  }
  if (!normalizedQuestion) {
    return response.status(400).json({ error: 'Type a natural-language question before analyzing.' })
  }
  if (normalizedQuestion.length > MAX_QUESTION_LENGTH) {
    return response.status(400).json({
      error: `Question is too long. Keep it under ${MAX_QUESTION_LENGTH} characters.`,
    })
  }

  try {
    const session = await hydrateSession(request.authUserId, sessionId)
    if (!session) {
      return response.status(404).json({ error: 'Upload a CSV file before asking questions.' })
    }

    const sqlQuery = await planAnalysisSql({
      question: normalizedQuestion,
      profile: session.profile,
    })
    
    let pythonResult
    try {
        pythonResult = await executeSqlAnalysis(sessionId, sqlQuery)
    } catch (e) {
        throw new Error(`DuckDB execution failed: ${e.message}`)
    }

    const analysis = {
      ...(await generateInsightsAndChart({ question: normalizedQuestion, sqlResultRows: pythonResult.rows })),
      suggestionChips: buildSuggestionChips(session.profile),
      plan: { sql: sqlQuery },
    }

    if (isDatabaseEnabled()) {
      await AnalysisSession.findOneAndUpdate(
        { sessionId, userId: request.authUserId },
        {
          $push: {
            messages: {
              $each: [
                { role: 'user', content: normalizedQuestion },
                { role: 'assistant', content: analysis.summary || analysis.title || 'Analysis completed.' },
              ],
            },
            analyses: {
              question: normalizedQuestion,
              plan: { sql: sqlQuery },
              response: analysis,
            },
          },
        },
      )
    }

    return response.json({
      sessionId,
      question: normalizedQuestion,
      filename: session.filename,
      analysis,
    })
  } catch (error) {
    return response.status(500).json({
      error: error.message || 'Analysis failed.',
    })
  }
})

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return response.status(400).json({
      error: `CSV file is too large. Maximum size is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`,
    })
  }

  if (error) {
    return response.status(400).json({ error: error.message || 'Request failed.' })
  }

  return response.status(500).json({ error: 'Unexpected server error.' })
})

app.get('/api/session/:sessionId/history', requireAuth, async (request, response) => {
  const { sessionId } = request.params

  if (isDatabaseEnabled()) {
    const session = await AnalysisSession.findOne({ sessionId, userId: request.authUserId }).lean()
    if (session) {
      return response.json({
        sessionId,
        messages: session.messages ?? [],
        analyses: session.analyses ?? [],
      })
    }
  }

  return response.json({
    sessionId,
    messages: [],
    analyses: [],
  })
})

app.get('/api/session/:sessionId', requireAuth, async (request, response) => {
  const { sessionId } = request.params

  const memorySession = sessions.get(sessionCacheKey(request.authUserId, sessionId))
  if (memorySession && !isDatabaseEnabled()) {
    return response.json({
      sessionId,
      filename: memorySession.filename,
      profile: memorySession.profile,
      latestAnalysis: null,
    })
  }

  if (isDatabaseEnabled()) {
    const session = await AnalysisSession.findOne({ sessionId, userId: request.authUserId }).lean()
    if (session) {
      return response.json({
        sessionId,
        filename: session.filename,
        profile: session.profile,
        latestAnalysis: session.analyses?.length ? session.analyses[session.analyses.length - 1].response : null,
      })
    }
  }

  return response.status(404).json({ error: 'Session not found.' })
})

app.get('/api/boards', requireAuth, async (request, response) => {
  if (!isDatabaseEnabled()) {
    return response.json({ boards: [] })
  }

  const boards = await BoardSnapshot.find(
    { userId: request.authUserId },
    { sessionId: 1, title: 1, mode: 1, focusedViewId: 1, filename: 1, updatedAt: 1 },
  )
    .sort({ updatedAt: -1 })
    .limit(12)
    .lean()

  return response.json({
    boards: boards.map((board) => ({
      id: board._id.toString(),
      sessionId: board.sessionId,
      title: board.title,
      mode: board.mode,
      focusedViewId: board.focusedViewId,
      filename: board.filename,
      updatedAt: board.updatedAt,
    })),
  })
})

app.post('/api/boards', requireAuth, async (request, response) => {
  const { sessionId, title, mode, focusedViewId } = request.body ?? {}

  if (!isDatabaseEnabled()) {
    return response.status(400).json({ error: 'Board saving requires MongoDB to be configured.' })
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return response.status(400).json({ error: 'A valid session is required to save a board.' })
  }

  const session = await hydrateSession(request.authUserId, sessionId)
  if (!session) {
    return response.status(404).json({ error: 'Session not found for board save.' })
  }

  const snapshot = await BoardSnapshot.create({
    userId: request.authUserId,
    sessionId,
    filename: session.filename,
    title: String(title || 'Saved board').slice(0, 120),
    mode: String(mode || 'overview'),
    focusedViewId: focusedViewId ? String(focusedViewId) : null,
  })

  return response.status(201).json({
    id: snapshot._id.toString(),
    sessionId: snapshot.sessionId,
    filename: snapshot.filename,
    title: snapshot.title,
    mode: snapshot.mode,
    focusedViewId: snapshot.focusedViewId,
    updatedAt: snapshot.updatedAt,
  })
})

app.get('/api/boards/:boardId', requireAuth, async (request, response) => {
  const { boardId } = request.params

  if (!isDatabaseEnabled()) {
    return response.status(400).json({ error: 'Board loading requires MongoDB to be configured.' })
  }

  const snapshot = await BoardSnapshot.findOne({ _id: boardId, userId: request.authUserId }).lean()
  if (!snapshot) {
    return response.status(404).json({ error: 'Saved board not found.' })
  }

  return response.json({
    id: snapshot._id.toString(),
    sessionId: snapshot.sessionId,
    filename: snapshot.filename,
    title: snapshot.title,
    mode: snapshot.mode,
    focusedViewId: snapshot.focusedViewId,
    updatedAt: snapshot.updatedAt,
  })
})

app.get('/api/sessions/recent', requireAuth, async (request, response) => {
  if (!isDatabaseEnabled()) {
    return response.json({ sessions: [] })
  }

  const sessionsList = await AnalysisSession.find(
    { userId: request.authUserId },
    { sessionId: 1, filename: 1, profile: 1, updatedAt: 1 },
  )
    .sort({ updatedAt: -1 })
    .limit(8)
    .lean()

  return response.json({
    sessions: sessionsList.map((session) => ({
      sessionId: session.sessionId,
      filename: session.filename,
      rowCount: session.profile?.rowCount ?? 0,
      columns: session.profile?.columns?.length ?? 0,
      updatedAt: session.updatedAt,
    })),
  })
})

connectToDatabase()
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message)
  })
  .finally(() => {
    if (getPreferredAiProvider() === 'none') {
      console.warn('No AI provider key found. Falling back to local-only analysis responses.')
    }
    if (!hasDatabaseConfig()) {
      console.warn('MONGODB_URI not found. Running in memory-only persistence mode.')
    }
    if (!process.env.PYTHON_SERVICE_URL) {
      console.warn('PYTHON_SERVICE_URL not set. Using default http://127.0.0.1:8000.')
    }

    app.listen(PORT, () => {
      console.log(`AI analyst server running on http://localhost:${PORT}`)
    })
  })
