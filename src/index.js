/**
 * ============================================================
 * KUASATURBO PHASE 1α - MAIN ENTRY POINT
 * ============================================================
 * Constitutional AI Execution Substrate
 * 
 * "KuasaTurbo executes once. Qontrek remembers forever. Only humans decide."
 * 
 * Layer 0 Properties:
 * - One-off execution only
 * - No continuity authority
 * - No decision-making
 * - Output expires in 24 hours
 * ============================================================
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Local modules
import { executeZ4Job } from './jobs/z4-executor.js';
import { generateProofPack } from './proof/generator.js';
import { S7Guard } from './guards/s7-guard.js';
import { validateJobRequest } from './validators/job-validator.js';
import { TokenCounter } from './metrics/token-counter.js';

// Load environment
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  port: process.env.PORT || 3001,
  ttlSeconds: parseInt(process.env.OUTPUT_TTL_SECONDS || '86400'), // 24 hours
  jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_SECONDS || '120') * 1000,
  maxRetries: parseInt(process.env.MAX_RETRY_COUNT || '3'),
  storageMode: process.env.STORAGE_MODE || 'memory',
  s7Enabled: process.env.S7_ENFORCEMENT_ENABLED !== 'false',
};

// ============================================================
// IN-MEMORY STORAGE (Phase 1α)
// ============================================================

const jobStore = new Map(); // job_id -> job data
const s7Guard = new S7Guard();
const tokenCounter = new TokenCounter();

// ============================================================
// EXPRESS APP SETUP
// ============================================================

const app = express();

// CORS configuration - supports local dev and production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or matches Vercel preview URLs
    if (allowedOrigins.includes(origin) ||
        origin.includes('vercel.app') ||
        origin.includes('kuasaturbo')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// File upload configuration
const storage = multer.diskStorage({
  destination: process.env.INPUT_DIR || './inputs',
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4().slice(0, 8)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5 // Max 5 files per request
  }
});

// ============================================================
// CONSTITUTIONAL BANNER
// ============================================================

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║           KUASATURBO EXECUTION SUBSTRATE                      ║
║                    Phase 1α                                   ║
╠═══════════════════════════════════════════════════════════════╣
║  Layer: 0 (EXTERNAL)                                          ║
║  Authority: NONE                                              ║
║  Continuity: FORBIDDEN (S7 Enforced)                          ║
║  TTL: ${String(CONFIG.ttlSeconds).padEnd(6)} seconds (${CONFIG.ttlSeconds / 3600} hours)                          ║
╠═══════════════════════════════════════════════════════════════╣
║  "KuasaTurbo executes once.                                   ║
║   Qontrek remembers forever.                                  ║
║   Only humans decide."                                        ║
╚═══════════════════════════════════════════════════════════════╝
`;

// ============================================================
// HEALTH CHECK ENDPOINT
// ============================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    layer: 0,
    service: 'kuasaturbo',
    phase: '1alpha',
    s7_enforced: CONFIG.s7Enabled,
    ttl_seconds: CONFIG.ttlSeconds,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * POST /api/jobs/submit
 * Submit a new z4_format_transform job
 */
app.post('/api/jobs/submit', upload.array('files', 5), async (req, res) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  console.log(`[${requestId}] Job submission received`);
  
  try {
    // Parse request body
    const { job_type, transform_type, tenant_id, idempotency_key } = req.body;
    
    // Validate job type
    if (job_type !== 'z4_format_transform') {
      return res.status(400).json({
        error: 'INVALID_JOB_TYPE',
        message: 'Phase 1α only supports z4_format_transform',
        allowed: ['z4_format_transform']
      });
    }
    
    // Validate transform type
    if (!['mortgage_eligibility_summary', 'solar_proposal_draft'].includes(transform_type)) {
      return res.status(400).json({
        error: 'INVALID_TRANSFORM_TYPE',
        message: 'Invalid transform type',
        allowed: ['mortgage_eligibility_summary', 'solar_proposal_draft']
      });
    }
    
    // S7 Guard: Check for chaining attempt
    if (CONFIG.s7Enabled) {
      const s7Check = s7Guard.checkSubmission({
        tenant_id,
        idempotency_key,
        references_previous: req.body.previous_job_id || req.body.depends_on
      });
      
      if (!s7Check.allowed) {
        console.log(`[${requestId}] S7 VIOLATION: ${s7Check.reason}`);
        return res.status(403).json({
          error: 'S7_VIOLATION',
          message: s7Check.reason,
          invariant: 'S7: No Continuity',
          governance: {
            blocked: true,
            reason: 'Constitutional violation detected'
          }
        });
      }
    }
    
    // Create job record
    const job_id = uuidv4();
    const now = new Date();
    const expires_at = new Date(now.getTime() + CONFIG.ttlSeconds * 1000);
    
    const job = {
      job_id,
      tenant_id: tenant_id || 'demo-tenant',
      idempotency_key: idempotency_key || `${tenant_id}-${transform_type}-${now.toISOString().slice(0, 10)}`,
      job_type,
      transform_type,
      status: 'queued',
      created_at: now.toISOString(),
      expires_at: expires_at.toISOString(),
      ttl_seconds: CONFIG.ttlSeconds,
      files: req.files?.map(f => ({
        fieldname: f.fieldname,
        originalname: f.originalname,
        path: f.path,
        size: f.size,
        mimetype: f.mimetype
      })) || [],
      retry_count: 0,
      governance: {
        dry_run: req.body.dry_run === 'true',
        classification: 'Z',
        s7_checked: true
      }
    };
    
    // Store job
    jobStore.set(job_id, job);
    
    console.log(`[${requestId}] Job created: ${job_id}`);
    
    // Start async execution
    executeJobAsync(job_id, requestId);
    
    // Return immediate response
    res.status(202).json({
      job_id,
      status: 'queued',
      message: 'Job queued for execution',
      expires_at: job.expires_at,
      ttl_seconds: CONFIG.ttlSeconds,
      governance: {
        layer: 0,
        authority: 'NONE',
        s7_checked: true,
        disclaimer: 'This execution produces artifacts only. No decisions will be made.'
      }
    });
    
  } catch (error) {
    console.error(`[${requestId}] Submission error:`, error);
    res.status(500).json({
      error: 'SUBMISSION_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/jobs/:job_id/status
 * Get job status
 */
app.get('/api/jobs/:job_id/status', (req, res) => {
  const { job_id } = req.params;
  const job = jobStore.get(job_id);
  
  if (!job) {
    return res.status(404).json({
      error: 'JOB_NOT_FOUND',
      message: `Job ${job_id} not found`
    });
  }
  
  // Check expiration
  const now = new Date();
  const expiresAt = new Date(job.expires_at);
  const isExpired = now > expiresAt;
  
  res.json({
    job_id: job.job_id,
    status: isExpired ? 'expired' : job.status,
    progress: job.progress || 0,
    created_at: job.created_at,
    expires_at: job.expires_at,
    is_expired: isExpired,
    time_remaining_seconds: isExpired ? 0 : Math.floor((expiresAt - now) / 1000),
    error: job.error || null
  });
});

/**
 * GET /api/jobs/:job_id/result
 * Get job result (only if completed)
 */
app.get('/api/jobs/:job_id/result', (req, res) => {
  const { job_id } = req.params;
  const job = jobStore.get(job_id);
  
  if (!job) {
    return res.status(404).json({
      error: 'JOB_NOT_FOUND',
      message: `Job ${job_id} not found`
    });
  }
  
  // Check expiration
  const now = new Date();
  const expiresAt = new Date(job.expires_at);
  const isExpired = now > expiresAt;
  
  if (isExpired) {
    return res.status(410).json({
      error: 'JOB_EXPIRED',
      message: 'This job output has expired. Please submit a new job.',
      expired_at: job.expires_at,
      governance: {
        ttl_seconds: CONFIG.ttlSeconds,
        reason: 'Output expiration enforces human re-engagement'
      }
    });
  }
  
  if (job.status !== 'completed') {
    return res.status(400).json({
      error: 'JOB_NOT_COMPLETED',
      message: `Job status is '${job.status}', not 'completed'`,
      status: job.status
    });
  }
  
  res.json({
    job_id: job.job_id,
    status: job.status,
    duration_ms: job.duration_ms || null,
    completed_at: job.completed_at || null,
    outputs: job.outputs || [],
    proof: job.proof || null,
    token_metrics: job.token_metrics || null,
    expires_at: job.expires_at,
    time_remaining_seconds: Math.floor((expiresAt - now) / 1000),
    promotion_eligible: job.status === 'completed' && !isJobExpired(job),
    governance: {
      layer: 0,
      authoritative: false,
      disclaimer: 'This output is NOT authoritative. Human review required.'
    }
  });
});

/**
 * GET /api/jobs/:job_id/proof
 * Get proof pack
 */
app.get('/api/jobs/:job_id/proof', (req, res) => {
  const { job_id } = req.params;
  const job = jobStore.get(job_id);
  
  if (!job) {
    return res.status(404).json({
      error: 'JOB_NOT_FOUND',
      message: `Job ${job_id} not found`
    });
  }
  
  if (!job.proof) {
    return res.status(400).json({
      error: 'PROOF_NOT_AVAILABLE',
      message: 'Proof pack not yet generated',
      status: job.status
    });
  }
  
  res.json({
    proof: job.proof,
    token_metrics: job.token_metrics || null,
    expires_at: job.expires_at,
    governance: {
      layer: 0,
      stage: 'EXTERNAL',
      authoritative: false,
      promotion_eligible: job.status === 'completed' && !isJobExpired(job),
      disclaimer: 'This proof pack is from KuasaTurbo (Layer 0). It is an execution record only, NOT a governance artifact.'
    }
  });
});

/**
 * POST /api/jobs/:job_id/retry
 * Retry same job (same job_id, same inputs)
 */
app.post('/api/jobs/:job_id/retry', async (req, res) => {
  const { job_id } = req.params;
  const job = jobStore.get(job_id);
  
  if (!job) {
    return res.status(404).json({
      error: 'JOB_NOT_FOUND',
      message: `Job ${job_id} not found`
    });
  }
  
  // Check retry count
  if (job.retry_count >= CONFIG.maxRetries) {
    return res.status(400).json({
      error: 'MAX_RETRIES_EXCEEDED',
      message: `Maximum retry count (${CONFIG.maxRetries}) exceeded`,
      retry_count: job.retry_count
    });
  }
  
  // S7 Guard: Retry must use SAME job_id
  // This is enforced by not creating a new job_id
  
  // Reset job for retry
  job.status = 'queued';
  job.retry_count += 1;
  job.error = null;
  job.outputs = null;
  job.proof = null;
  job.token_metrics = null;
  
  // Extend expiration
  const now = new Date();
  job.expires_at = new Date(now.getTime() + CONFIG.ttlSeconds * 1000).toISOString();
  
  console.log(`[RETRY] Job ${job_id} retry #${job.retry_count}`);
  
  // Re-execute
  executeJobAsync(job_id, `retry-${job.retry_count}`);
  
  res.status(202).json({
    job_id: job.job_id, // SAME job_id (S7 compliant)
    status: 'queued',
    retry_count: job.retry_count,
    message: 'Job retry initiated',
    governance: {
      s7_compliant: true,
      note: 'Retry uses same job_id (no new job created)'
    }
  });
});

/**
 * GET /api/jobs/:job_id/outputs/:filename
 * Download specific output file
 */
app.get('/api/jobs/:job_id/outputs/:filename', (req, res) => {
  const { job_id, filename } = req.params;
  const job = jobStore.get(job_id);
  
  if (!job || !job.outputs) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Job or output not found'
    });
  }
  
  // Check expiration
  if (isJobExpired(job)) {
    return res.status(410).json({
      error: 'JOB_EXPIRED',
      message: 'Output has expired'
    });
  }
  
  const output = job.outputs.find(o => o.name === filename);
  if (!output) {
    return res.status(404).json({
      error: 'FILE_NOT_FOUND',
      message: `File ${filename} not found in job outputs`
    });
  }
  
  res.download(output.path, output.name);
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isJobExpired(job) {
  return new Date() > new Date(job.expires_at);
}

async function executeJobAsync(job_id, requestId) {
  const job = jobStore.get(job_id);
  if (!job) return;
  
  console.log(`[${requestId}] Starting execution for job ${job_id}`);
  
  try {
    // Update status
    job.status = 'processing';
    job.started_at = new Date().toISOString();
    
    // Execute z4 transform
    const result = await executeZ4Job(job, {
      onProgress: (progress) => {
        job.progress = progress;
      }
    });
    
    // Generate proof pack
    const proof = await generateProofPack(job, result);
    
    // Calculate token metrics
    const tokenMetrics = tokenCounter.calculate(result);
    
    // Update job with results
    job.status = 'completed';
    job.completed_at = new Date().toISOString();
    job.duration_ms = new Date(job.completed_at) - new Date(job.started_at);
    job.outputs = result.outputs;
    job.proof = proof;
    job.token_metrics = tokenMetrics;
    job.progress = 100;
    
    console.log(`[${requestId}] Job ${job_id} completed in ${job.duration_ms}ms`);
    
  } catch (error) {
    console.error(`[${requestId}] Job ${job_id} failed:`, error);
    
    job.status = 'failed';
    job.completed_at = new Date().toISOString();
    job.error = {
      code: error.code || 'EXECUTION_ERROR',
      message: error.message
    };
    
    // Still generate proof pack for failed jobs (audit purposes)
    try {
      job.proof = await generateProofPack(job, { error: job.error });
    } catch (proofError) {
      console.error(`[${requestId}] Proof generation failed:`, proofError);
    }
  }
}

// ============================================================
// START SERVER
// ============================================================

app.listen(CONFIG.port, () => {
  console.log(BANNER);
  console.log(`KuasaTurbo listening on port ${CONFIG.port}`);
  console.log(`S7 Enforcement: ${CONFIG.s7Enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Storage Mode: ${CONFIG.storageMode}`);
  console.log(`Ready for z4_format_transform jobs`);
});

export default app;
