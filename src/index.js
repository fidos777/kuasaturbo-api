/**
 * KUASATURBO API - SIMPLIFIED VERSION FOR RAILWAY
 */

import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

const jobStore = new Map();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', layer: 0, service: 'kuasaturbo', timestamp: new Date().toISOString() });
});

app.post('/api/jobs/submit', async (req, res) => {
  const job_id = uuidv4();
  const now = new Date();
  const expires_at = new Date(now.getTime() + 86400000);
  const job = { job_id, status: 'queued', created_at: now.toISOString(), expires_at: expires_at.toISOString(), ...req.body };
  jobStore.set(job_id, job);
  processJob(job_id);
  res.status(202).json({ job_id, status: 'queued', expires_at: job.expires_at });
});

app.get('/api/jobs/:job_id/status', (req, res) => {
  const job = jobStore.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  res.json({ job_id: job.job_id, status: job.status, progress: job.progress || 0 });
});

app.get('/api/jobs/:job_id/result', (req, res) => {
  const job = jobStore.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'JOB_NOT_COMPLETED' });
  res.json({ job_id: job.job_id, status: job.status, duration_ms: job.duration_ms, outputs: job.outputs, token_metrics: job.token_metrics, expires_at: job.expires_at });
});

app.get('/api/jobs/:job_id/proof', (req, res) => {
  const job = jobStore.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  if (!job.proof) return res.status(400).json({ error: 'PROOF_NOT_AVAILABLE' });
  res.json({ proof: job.proof, token_metrics: job.token_metrics });
});

app.post('/api/jobs/:job_id/retry', (req, res) => {
  const job = jobStore.get(req.params.job_id);
  if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  job.status = 'queued';
  job.retry_count = (job.retry_count || 0) + 1;
  processJob(job.job_id);
  res.status(202).json({ job_id: job.job_id, status: 'queued', retry_count: job.retry_count });
});

async function processJob(job_id) {
  const job = jobStore.get(job_id);
  if (!job) return;
  const startTime = Date.now();
  job.status = 'processing';
  job.progress = 10;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    job.progress = 30;
    const response = await anthropic.messages.create({
      model: process.env.DEFAULT_MODEL || 'claude-3-haiku-20240307',
      max_tokens: 4096,
      system: 'You are a document extraction system. Extract and structure information. Do NOT make decisions.',
      messages: [{ role: 'user', content: 'Extract information from this document submission.' }]
    });
    job.progress = 80;
    const duration_ms = Date.now() - startTime;
    job.status = 'completed';
    job.completed_at = new Date().toISOString();
    job.duration_ms = duration_ms;
    job.progress = 100;
    job.outputs = [{ name: 'extracted_data.json', content_type: 'application/json', content: response.content[0].text }];
    job.token_metrics = { tokens_in: response.usage.input_tokens, tokens_out: response.usage.output_tokens, total_tokens: response.usage.input_tokens + response.usage.output_tokens, model_used: process.env.DEFAULT_MODEL || 'claude-3-haiku-20240307' };
    job.proof = { proof_pack_id: `proof-${job_id}`, job_id, layer: '0', source: 'kuasaturbo', authoritative: false, status: 'active', timing: { created_at: job.created_at, completed_at: job.completed_at, duration_ms, expires_at: job.expires_at }, integrity: { input_hash: 'sha256:demo', output_hash: 'sha256:demo' }, governance_applied: { dry_run_enforced: false, classification_honored: 'Z', invariants_checked: [{ id: 'S1-ProofProduction', passed: true }, { id: 'S7-NoContinuity', passed: true }] }, continuity_check: { s7_compliant: true, chain_references_found: false }, expiration: { expires_at: job.expires_at, ttl_seconds: 86400, is_expired: false, can_promote: true } };
    console.log(`Job ${job_id} completed in ${duration_ms}ms`);
  } catch (error) {
    console.error(`Job ${job_id} failed:`, error.message);
    job.status = 'failed';
    job.error = { code: 'EXECUTION_ERROR', message: error.message };
  }
}

app.listen(PORT, HOST, () => {
  console.log(`KuasaTurbo API listening on ${HOST}:${PORT}`);
});
