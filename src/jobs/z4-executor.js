/**
 * ============================================================
 * Z4 EXECUTOR - FORMAT TRANSFORM EXECUTION
 * ============================================================
 * Job Type: z4_format_transform
 * CIVOS Class: Z (Content generation, no authority)
 * 
 * Supported transforms:
 * - mortgage_eligibility_summary
 * - solar_proposal_draft
 * 
 * Output: Structured PDF + JSON (NON-AUTHORITATIVE)
 * ============================================================
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  model: process.env.DEFAULT_MODEL || 'claude-3-haiku-20240307',
  maxInputTokens: parseInt(process.env.MAX_INPUT_TOKENS || '100000'),
  maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS || '4096'),
  outputDir: process.env.OUTPUT_DIR || './outputs',
};

// ============================================================
// FORBIDDEN OUTPUT LANGUAGE
// ============================================================

const FORBIDDEN_PHRASES = {
  mortgage: [
    'Eligible for loan',
    'Not eligible',
    'Approved',
    'Rejected',
    'Recommended',
    'Should apply',
    'Likely to qualify',
    'High risk',
    'Medium risk',
    'Low risk',
    'Score:',
    'Rating:',
    'Meets criteria',
    'Does not meet criteria',
    'Suggested loan amount',
    'Recommended next step'
  ],
  solar: [
    'Recommended system size',
    'Estimated savings',
    'ROI:',
    'Payback period',
    'Best option',
    'Should install',
    'Suitable for',
    'Not suitable',
    'Quotation',
    'Price:',
    'Recommended panels',
    'Suggested configuration',
    'Expected generation'
  ]
};

// ============================================================
// PROMPT TEMPLATES
// ============================================================

const PROMPTS = {
  mortgage_eligibility_summary: `You are a document extraction system. Your task is to extract and structure information from the provided documents. 

CRITICAL RULES:
1. You MUST NOT make any eligibility decisions
2. You MUST NOT provide recommendations
3. You MUST NOT use approval/rejection language
4. You ONLY extract and format existing information
5. Mark any unclear fields as "requires_review"

Extract the following information and return as JSON:

{
  "personal": {
    "name": "extracted name or null",
    "ic_number": "extracted IC or null",
    "date_of_birth": "extracted DOB or null"
  },
  "employment": {
    "employer": "extracted employer or null",
    "position": "extracted position or null",
    "gross_salary": "number or null",
    "net_salary": "number or null",
    "pay_period": "monthly/weekly or null"
  },
  "financial": {
    "account_type": "savings/current or null",
    "average_balance": "number or null",
    "statement_period": "extracted period or null"
  },
  "extraction_metadata": {
    "fields_extracted": "count",
    "fields_total": "count",
    "fields_requiring_review": ["list of uncertain fields"],
    "confidence_scores": {
      "field_name": 0.0-1.0
    }
  }
}

Remember: You are extracting information, NOT making decisions.`,

  solar_proposal_draft: `You are a document extraction system. Your task is to extract and structure information from the provided documents.

CRITICAL RULES:
1. You MUST NOT provide pricing or quotations
2. You MUST NOT recommend system sizes
3. You MUST NOT calculate ROI or savings
4. You MUST NOT make installation recommendations
5. You ONLY extract and format existing information

Extract the following information and return as JSON:

{
  "property": {
    "address": "extracted address or null",
    "property_type": "residential/commercial or null"
  },
  "consumption": {
    "account_number": "extracted account or null",
    "billing_period": "extracted period or null",
    "total_kwh": "number or null",
    "total_amount": "number or null",
    "tariff_category": "extracted tariff or null"
  },
  "visual": {
    "photo_observations": "factual observations only, no recommendations"
  },
  "extraction_metadata": {
    "fields_extracted": "count",
    "fields_total": "count",
    "fields_requiring_review": ["list of uncertain fields"],
    "confidence_scores": {
      "field_name": 0.0-1.0
    }
  }
}

Remember: You are extracting information, NOT making recommendations.`
};

// ============================================================
// DISCLAIMER TEMPLATES
// ============================================================

const DISCLAIMERS = {
  mortgage_eligibility_summary: `
⚠️ DISCLAIMER
This document contains extracted information only.
It does NOT constitute eligibility assessment.
All decisions must be made by qualified human officers.

This output is from KuasaTurbo (Layer 0).
It is NOT authoritative until promoted to Qontrek (Layer 1).
No decisions have been made.`,

  solar_proposal_draft: `
⚠️ DISCLAIMER
This document contains extracted information only.
It does NOT constitute a quotation or recommendation.
All proposals must be reviewed and finalized by sales team.

This output is from KuasaTurbo (Layer 0).
It is NOT authoritative until promoted to Qontrek (Layer 1).
No recommendations have been made.`
};

// ============================================================
// MAIN EXECUTOR
// ============================================================

/**
 * Execute z4_format_transform job
 * @param {Object} job - Job definition
 * @param {Object} options - Execution options
 * @returns {Object} Execution result with outputs
 */
export async function executeZ4Job(job, options = {}) {
  const { onProgress } = options;
  const startTime = Date.now();
  
  console.log(`[Z4] Starting execution: ${job.job_id}`);
  console.log(`[Z4] Transform type: ${job.transform_type}`);
  
  // Report progress
  if (onProgress) onProgress(10);
  
  // Get appropriate prompt
  const systemPrompt = PROMPTS[job.transform_type];
  if (!systemPrompt) {
    throw new Error(`Unknown transform type: ${job.transform_type}`);
  }
  
  // Process input files
  const inputContent = await processInputFiles(job.files);
  if (onProgress) onProgress(30);
  
  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  // Execute AI extraction
  console.log(`[Z4] Calling AI model: ${CONFIG.model}`);
  
  const response = await anthropic.messages.create({
    model: CONFIG.model,
    max_tokens: CONFIG.maxOutputTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Please extract information from these documents:\n\n${inputContent}`
      }
    ]
  });
  
  if (onProgress) onProgress(70);
  
  // Parse response
  const extractedContent = response.content[0].text;
  let extractedData;
  
  try {
    // Try to parse as JSON
    const jsonMatch = extractedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extractedData = JSON.parse(jsonMatch[0]);
    } else {
      extractedData = { raw_extraction: extractedContent };
    }
  } catch (e) {
    console.warn('[Z4] Could not parse as JSON, using raw content');
    extractedData = { raw_extraction: extractedContent };
  }
  
  // Validate output for forbidden language
  validateOutputLanguage(extractedContent, job.transform_type);
  
  if (onProgress) onProgress(80);
  
  // Generate outputs
  const outputs = await generateOutputs(job, extractedData);
  
  if (onProgress) onProgress(90);
  
  // Calculate token usage
  const tokenUsage = {
    tokens_in: response.usage.input_tokens,
    tokens_out: response.usage.output_tokens,
    total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    model_used: CONFIG.model
  };
  
  const endTime = Date.now();
  
  console.log(`[Z4] Execution complete: ${endTime - startTime}ms`);
  console.log(`[Z4] Tokens: ${tokenUsage.total_tokens}`);
  
  return {
    success: true,
    outputs,
    extracted_data: extractedData,
    token_usage: tokenUsage,
    execution_time_ms: endTime - startTime
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Process input files and extract content
 */
async function processInputFiles(files) {
  const contents = [];
  
  for (const file of files) {
    const content = await extractFileContent(file);
    contents.push(`--- ${file.originalname} ---\n${content}\n`);
  }
  
  return contents.join('\n');
}

/**
 * Extract content from a file based on its type
 */
async function extractFileContent(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  
  // For Phase 1α, we'll use placeholder extraction
  // In production, integrate proper OCR/PDF extraction
  
  switch (ext) {
    case '.pdf':
      // TODO: Integrate pdf-parse or similar
      return `[PDF Content from: ${file.originalname}]\n[Size: ${file.size} bytes]\n[Requires OCR processing]`;
    
    case '.jpg':
    case '.jpeg':
    case '.png':
      // TODO: Integrate image OCR
      return `[Image Content from: ${file.originalname}]\n[Size: ${file.size} bytes]\n[Requires image OCR]`;
    
    case '.txt':
      // Read text file directly
      const { readFile } = await import('fs/promises');
      return await readFile(file.path, 'utf-8');
    
    default:
      return `[Unknown file type: ${file.originalname}]`;
  }
}

/**
 * Validate output doesn't contain forbidden language
 */
function validateOutputLanguage(content, transformType) {
  const forbidden = FORBIDDEN_PHRASES[transformType.split('_')[0]] || [];
  
  for (const phrase of forbidden) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      console.warn(`[Z4] WARNING: Output contains forbidden phrase: "${phrase}"`);
      // In strict mode, could throw error here
    }
  }
}

/**
 * Generate output files (PDF + JSON)
 */
async function generateOutputs(job, extractedData) {
  const outputs = [];
  const outputDir = path.join(CONFIG.outputDir, job.job_id);
  
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });
  
  // 1. Generate JSON output
  const jsonFileName = 'extracted_data.json';
  const jsonPath = path.join(outputDir, jsonFileName);
  const jsonContent = JSON.stringify(extractedData, null, 2);
  
  await writeFile(jsonPath, jsonContent, 'utf-8');
  
  outputs.push({
    name: jsonFileName,
    content_type: 'application/json',
    path: jsonPath,
    size_bytes: Buffer.byteLength(jsonContent),
    sha256: computeHash(jsonContent)
  });
  
  // 2. Generate summary document (text for now, PDF in full implementation)
  const summaryFileName = job.transform_type === 'mortgage_eligibility_summary' 
    ? 'eligibility_summary.txt' 
    : 'proposal_draft.txt';
  
  const summaryPath = path.join(outputDir, summaryFileName);
  const summaryContent = generateSummaryDocument(job, extractedData);
  
  await writeFile(summaryPath, summaryContent, 'utf-8');
  
  outputs.push({
    name: summaryFileName,
    content_type: 'text/plain',
    path: summaryPath,
    size_bytes: Buffer.byteLength(summaryContent),
    sha256: computeHash(summaryContent)
  });
  
  return outputs;
}

/**
 * Generate summary document content
 */
function generateSummaryDocument(job, extractedData) {
  const title = job.transform_type === 'mortgage_eligibility_summary'
    ? 'ELIGIBILITY SUMMARY (Non-Decision Document)'
    : 'SOLAR PROPOSAL DRAFT (Non-Binding Document)';
  
  const disclaimer = DISCLAIMERS[job.transform_type];
  const now = new Date();
  const expiresAt = new Date(job.expires_at);
  
  let content = `
════════════════════════════════════════════════════════════════════
${title}
════════════════════════════════════════════════════════════════════

DOCUMENT INFORMATION
────────────────────
Generated: ${now.toISOString()}
Job ID: ${job.job_id}
Expires: ${expiresAt.toISOString()}

${disclaimer}

════════════════════════════════════════════════════════════════════

EXTRACTED INFORMATION
─────────────────────

${formatExtractedData(extractedData)}

════════════════════════════════════════════════════════════════════

PROOF REFERENCE
───────────────
Job ID: ${job.job_id}
Tenant ID: ${job.tenant_id}
Idempotency Key: ${job.idempotency_key}

This document was generated by KuasaTurbo (Layer 0).
It is NOT authoritative until promoted to Qontrek (Layer 1).

════════════════════════════════════════════════════════════════════
`;

  return content;
}

/**
 * Format extracted data for display
 */
function formatExtractedData(data, indent = 0) {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result += `${spaces}${key}: [Not extracted]\n`;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      result += `${spaces}${key}:\n${formatExtractedData(value, indent + 1)}`;
    } else if (Array.isArray(value)) {
      result += `${spaces}${key}: ${value.join(', ') || '[None]'}\n`;
    } else {
      result += `${spaces}${key}: ${value}\n`;
    }
  }
  
  return result;
}

/**
 * Compute SHA256 hash of content
 */
function computeHash(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export default { executeZ4Job };
