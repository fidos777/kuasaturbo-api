/**
 * ============================================================
 * S7 GUARD - TEST SUITE
 * ============================================================
 * Tests for No Continuity Invariant Enforcement
 * 
 * Run with: npm run test:s7
 * Or: node --test src/guards/s7.test.js
 * ============================================================
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { S7Guard } from './s7-guard.js';

describe('S7 Guard - No Continuity Invariant', () => {
  let guard;
  
  beforeEach(() => {
    guard = new S7Guard();
    guard.clearViolations();
  });
  
  // =========================================================
  // TEST 1: Job cannot reference previous job
  // =========================================================
  describe('Test: Job cannot reference previous job', () => {
    
    it('should BLOCK submission with previous_job_id', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        previous_job_id: 'abc-123-def' // FORBIDDEN
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('S7'));
    });
    
    it('should BLOCK submission with depends_on field', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        depends_on: ['job-1', 'job-2'] // FORBIDDEN
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.violation.violations.some(v => v.field === 'depends_on'));
    });
    
    it('should BLOCK submission with references_previous flag', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        references_previous: true // FORBIDDEN
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should ALLOW submission without any reference fields', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        idempotency_key: 'unique-key-123'
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, true);
    });
  });
  
  // =========================================================
  // TEST 2: Job cannot trigger subsequent job
  // =========================================================
  describe('Test: Job cannot trigger subsequent job', () => {
    
    it('should BLOCK submission with workflow_id', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        workflow_id: 'workflow-abc' // FORBIDDEN
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.violation.violations.some(v => v.field === 'workflow_id'));
    });
    
    it('should BLOCK submission with next_step field', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        next_step: 'approval' // FORBIDDEN
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should BLOCK submission with sequence_id', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        sequence_id: 'seq-001' // FORBIDDEN
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should BLOCK metadata containing chain_id', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        metadata: {
          chain_id: 'chain-abc' // FORBIDDEN
        }
      };
      
      const result = guard.checkSubmission(submission);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.violation.violations.some(v => v.field === 'metadata.chain_id'));
    });
  });
  
  // =========================================================
  // TEST 3: Job cannot store state as truth
  // =========================================================
  describe('Test: Job cannot store state as truth', () => {
    
    it('should WARN if output contains "next step" language', () => {
      const result = {
        outputs: [{
          name: 'summary.json',
          content: 'Based on this analysis, the next step is to approve the loan.'
        }]
      };
      
      const check = guard.checkResult(result);
      
      assert.strictEqual(check.clean, false);
      assert.ok(check.warnings.length > 0);
      assert.ok(check.warnings.some(w => w.type === 'OUTPUT_CONTINUITY_LANGUAGE'));
    });
    
    it('should WARN if output contains "as we discussed" language', () => {
      const result = {
        outputs: [{
          name: 'report.txt',
          content: 'As we discussed in our previous session, the eligibility is...'
        }]
      };
      
      const check = guard.checkResult(result);
      
      assert.strictEqual(check.clean, false);
    });
    
    it('should WARN if structured output has forbidden fields', () => {
      const result = {
        outputs: [{
          name: 'data.json',
          data: {
            result: 'success',
            next_step: 'proceed_to_approval', // FORBIDDEN
            summary: 'Document processed'
          }
        }]
      };
      
      const check = guard.checkResult(result);
      
      assert.strictEqual(check.clean, false);
      assert.ok(check.warnings.some(w => w.field === 'next_step'));
    });
    
    it('should be CLEAN if output has no continuity signals', () => {
      const result = {
        outputs: [{
          name: 'summary.json',
          content: 'Document processed successfully. Extracted fields attached.',
          data: {
            extracted_name: 'John Doe',
            extracted_salary: 5000,
            confidence: 0.95
          }
        }]
      };
      
      const check = guard.checkResult(result);
      
      assert.strictEqual(check.clean, true);
      assert.strictEqual(check.warnings.length, 0);
    });
  });
  
  // =========================================================
  // TEST 4: S7 violation error handling
  // =========================================================
  describe('Test: S7 violation logging', () => {
    
    it('should LOG violations for audit', () => {
      const submission = {
        tenant_id: 'test-tenant',
        job_type: 'z4_format_transform',
        previous_job_id: 'abc-123'
      };
      
      guard.checkSubmission(submission);
      
      const violations = guard.getViolations();
      
      assert.strictEqual(violations.length, 1);
      assert.ok(violations[0].timestamp);
      assert.strictEqual(violations[0].tenant_id, 'test-tenant');
      assert.ok(violations[0].violations.length > 0);
    });
    
    it('should TRACK multiple violations', () => {
      guard.checkSubmission({ previous_job_id: '1' });
      guard.checkSubmission({ depends_on: ['2'] });
      guard.checkSubmission({ workflow_id: '3' });
      
      const violations = guard.getViolations();
      
      assert.strictEqual(violations.length, 3);
    });
  });
  
  // =========================================================
  // TEST 5: Retry semantics (S7 compliant retry)
  // =========================================================
  describe('Test: Retry does not create new job_id', () => {
    
    it('should ALLOW retry with same job_id', () => {
      const originalJob = {
        job_id: 'job-123',
        idempotency_key: 'key-abc'
      };
      
      const retryRequest = {
        job_id: 'job-123', // SAME
        idempotency_key: 'key-abc' // SAME
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, true);
    });
    
    it('should BLOCK retry with different job_id', () => {
      const originalJob = {
        job_id: 'job-123',
        idempotency_key: 'key-abc'
      };
      
      const retryRequest = {
        job_id: 'job-456', // DIFFERENT - FORBIDDEN
        idempotency_key: 'key-abc'
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('same job_id'));
    });
    
    it('should BLOCK retry with different idempotency_key', () => {
      const originalJob = {
        job_id: 'job-123',
        idempotency_key: 'key-abc'
      };
      
      const retryRequest = {
        job_id: 'job-123',
        idempotency_key: 'key-xyz' // DIFFERENT - FORBIDDEN
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('idempotency_key'));
    });
    
    it('should BLOCK retry with additional_inputs', () => {
      const originalJob = {
        job_id: 'job-123',
        idempotency_key: 'key-abc'
      };
      
      const retryRequest = {
        job_id: 'job-123',
        additional_inputs: ['new-file.pdf'] // FORBIDDEN
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes('new inputs'));
    });
  });
  
  // =========================================================
  // TEST 6: Content pattern detection
  // =========================================================
  describe('Test: Continuity language detection', () => {
    
    const continuityPhrases = [
      'Based on your previous request',
      'As we discussed earlier',
      'Continuing from where we left off',
      'Following up on the last job',
      'As mentioned before',
      'Remember that we processed',
      'Last time we analyzed',
      'In our previous session',
      'Building on the initial analysis',
      'This is step 2 of 3',
      'The next step would be'
    ];
    
    for (const phrase of continuityPhrases) {
      it(`should DETECT: "${phrase.slice(0, 30)}..."`, () => {
        const submission = {
          tenant_id: 'test-tenant',
          prompt: phrase
        };
        
        const result = guard.checkSubmission(submission);
        
        assert.strictEqual(result.allowed, false, 
          `Should block phrase: ${phrase}`);
      });
    }
    
    const safePhrases = [
      'Process this document',
      'Extract the following fields',
      'Transform to PDF format',
      'Calculate the totals',
      'Generate a summary'
    ];
    
    for (const phrase of safePhrases) {
      it(`should ALLOW: "${phrase}"`, () => {
        const submission = {
          tenant_id: 'test-tenant',
          prompt: phrase
        };
        
        const result = guard.checkSubmission(submission);
        
        assert.strictEqual(result.allowed, true,
          `Should allow phrase: ${phrase}`);
      });
    }
  });
  
  // =========================================================
  // TEST 7: Guard status reporting
  // =========================================================
  describe('Test: Guard status', () => {
    
    it('should report enabled status', () => {
      const status = guard.getStatus();
      
      assert.strictEqual(status.enabled, true);
      assert.strictEqual(status.invariant, 'S7');
      assert.strictEqual(status.name, 'No Continuity');
      assert.ok(status.forbidden_field_count > 0);
      assert.ok(status.content_pattern_count > 0);
    });
  });
});

// Run tests if executed directly
if (process.argv[1].includes('s7.test.js')) {
  console.log('Running S7 Guard tests...');
}
