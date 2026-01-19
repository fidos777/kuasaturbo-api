# KuasaTurbo AI Playground API

**Layer 0 Constitutional AI Execution Substrate**

> "KuasaTurbo executes once. Qontrek remembers forever. Only humans decide."

## Overview

KuasaTurbo is Layer 0 of the Qontrek Constitutional AI Economy platform. It provides execution-only AI processing with strict governance controls.

### Layer Properties

| Property | Value |
|----------|-------|
| Layer | 0 (EXTERNAL) |
| Authority | NONE |
| Continuity | FORBIDDEN (S7) |
| TTL | 24 hours |
| Stage | Always EXTERNAL |

## Quick Start

```bash
# 1. Setup environment
./scripts/setup.sh

# 2. Edit .env and add ANTHROPIC_API_KEY
nano .env

# 3. Start server
npm start

# 4. Run hello job test
npm run hello
```

## API Endpoints

### Submit Job
```bash
POST /api/jobs/submit
Content-Type: multipart/form-data

Fields:
- job_type: z4_format_transform
- transform_type: mortgage_eligibility_summary | solar_proposal_draft
- tenant_id: string
- files: (uploaded files)
```

### Check Status
```bash
GET /api/jobs/:job_id/status
```

### Get Result
```bash
GET /api/jobs/:job_id/result
```

### Get Proof Pack
```bash
GET /api/jobs/:job_id/proof
```

### Retry Job
```bash
POST /api/jobs/:job_id/retry
```

## Invariants

### S7: No Continuity

The substrate MUST NOT:
1. Trigger subsequent jobs based on output
2. Store state intended to influence future jobs
3. Make follow-up decisions based on execution results
4. Reference previous executions for decision-making
5. Maintain session state across job boundaries
6. Implement "memory" of previous interactions

## Project Structure

```
kuasaturbo-phase1a/
├── src/
│   ├── index.js           # Main entry point
│   ├── guards/
│   │   ├── s7-guard.js    # S7 invariant enforcement
│   │   ├── s7.test.js     # S7 tests
│   │   └── retry.test.js  # Retry tests
│   ├── jobs/
│   │   └── z4-executor.js # z4 transform execution
│   ├── proof/
│   │   └── generator.js   # Proof pack generation
│   ├── metrics/
│   │   └── token-counter.js # Token metrics
│   └── validators/
│       └── job-validator.js # Input validation
├── scripts/
│   ├── setup.sh           # Setup script
│   └── hello-job.js       # Validation script
├── docker/
│   └── Dockerfile         # Container definition
├── docker-compose.yml     # Docker compose config
├── .env.template          # Environment template
└── package.json           # Dependencies
```

## Testing

```bash
# Run all tests
npm test

# Run S7 tests only
npm run test:s7

# Run retry tests only
npm run test:retry

# Run hello job validation
npm run hello
```

## Constitutional Compliance

This implementation complies with:
- QONTREK_UNIFIED_ARCHITECTURE_CONSTITUTION v1.0
- PHASE_1_ALPHA_EXECUTION_TIMELINE v1.2
- PHASE_1_ALPHA_SPECIFICATION

### Output Disclaimer

All outputs include the disclaimer:
> "This output is from KuasaTurbo (Layer 0). It is NOT authoritative until promoted to Qontrek (Layer 1). No decisions have been made."

### Token Metrics Disclaimer

All token metrics include:
> "Token metrics are cost signals only. Lower cost does NOT mean higher quality or correctness."

## License

Proprietary - Qontrek

---

*"AI buat kerja. Manusia buat keputusan. Sistem govern kedua-dua."*
