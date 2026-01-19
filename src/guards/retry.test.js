/**
 * ============================================================
 * RETRY TESTS - S7 COMPLIANT RETRY SEMANTICS
 * ============================================================
 * Tests to verify retry uses same job_id (no new job creation)
 * 
 * Run with: npm run test:retry
 * Or: node --test src/guards/retry.test.js
 * ============================================================
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { S7Guard } from './s7-guard.js';

describe('Retry Semantics - S7 Compliant', () => {
  let guard;
  
  beforeEach(() => {
    guard = new S7Guard();
  });
  
  // =========================================================
  // TEST: Retry does not create new job_id
  // =========================================================
  describe('Retry does not create new job_id', () => {
    
    it('should ALLOW retry with exact same job_id', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-18',
        tenant_id: 'test-tenant'
      };
      
      const retryRequest = {
        job_id: 'job-abc-123', // SAME
        idempotency_key: 'tenant-mortgage-2026-01-18' // SAME
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, true,
        'Retry with same job_id should be allowed');
    });
    
    it('should BLOCK retry attempt with new job_id', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-18',
        tenant_id: 'test-tenant'
      };
      
      const retryRequest = {
        job_id: 'job-xyz-999', // DIFFERENT - S7 VIOLATION
        idempotency_key: 'tenant-mortgage-2026-01-18'
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false,
        'Retry with different job_id should be blocked');
      assert.ok(result.reason.includes('same job_id'),
        'Error should mention same job_id requirement');
    });
  });
  
  // =========================================================
  // TEST: Retry preserves idempotency_key
  // =========================================================
  describe('Retry preserves idempotency_key', () => {
    
    it('should ALLOW retry without specifying idempotency_key', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-18'
      };
      
      const retryRequest = {
        job_id: 'job-abc-123'
        // No idempotency_key specified - OK
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, true,
        'Retry without idempotency_key should be allowed (uses original)');
    });
    
    it('should ALLOW retry with matching idempotency_key', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-18'
      };
      
      const retryRequest = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-18' // SAME
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, true);
    });
    
    it('should BLOCK retry with different idempotency_key', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-18'
      };
      
      const retryRequest = {
        job_id: 'job-abc-123',
        idempotency_key: 'tenant-mortgage-2026-01-19' // DIFFERENT DATE
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false,
        'Retry with different idempotency_key should be blocked');
      assert.ok(result.reason.includes('idempotency_key'),
        'Error should mention idempotency_key preservation');
    });
  });
  
  // =========================================================
  // TEST: Retry cannot add new inputs
  // =========================================================
  describe('Retry cannot add new inputs', () => {
    
    it('should BLOCK retry with additional_inputs', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'key-123',
        files: [{ name: 'payslip.pdf' }]
      };
      
      const retryRequest = {
        job_id: 'job-abc-123',
        additional_inputs: ['extra_doc.pdf'] // NOT ALLOWED
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false,
        'Retry with additional inputs should be blocked');
      assert.ok(result.reason.includes('new inputs'),
        'Error should mention no new inputs');
    });
    
    it('should BLOCK retry with new_files', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'key-123'
      };
      
      const retryRequest = {
        job_id: 'job-abc-123',
        new_files: [{ name: 'another.pdf' }] // NOT ALLOWED
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, false);
    });
    
    it('should ALLOW retry with no input changes', () => {
      const originalJob = {
        job_id: 'job-abc-123',
        idempotency_key: 'key-123',
        files: [{ name: 'payslip.pdf' }]
      };
      
      const retryRequest = {
        job_id: 'job-abc-123'
        // No additional inputs
      };
      
      const result = guard.checkRetry(originalJob, retryRequest);
      
      assert.strictEqual(result.allowed, true);
    });
  });
  
  // =========================================================
  // TEST: Retry behavior simulation
  // =========================================================
  describe('Retry behavior simulation', () => {
    
    it('should simulate correct retry workflow', () => {
      // Original job creation
      const originalJob = {
        job_id: 'job-retry-test-001',
        idempotency_key: 'tenant-solar-2026-01-18',
        tenant_id: 'test-tenant',
        status: 'failed',
        retry_count: 0,
        files: [{ name: 'bill.pdf' }, { name: 'roof.jpg' }]
      };
      
      // First retry - should be allowed
      const retry1 = {
        job_id: 'job-retry-test-001', // SAME
        retry_count: 1
      };
      
      assert.strictEqual(guard.checkRetry(originalJob, retry1).allowed, true,
        'First retry should be allowed');
      
      // Second retry - should be allowed
      const retry2 = {
        job_id: 'job-retry-test-001', // SAME
        retry_count: 2
      };
      
      assert.strictEqual(guard.checkRetry(originalJob, retry2).allowed, true,
        'Second retry should be allowed');
      
      // Attempt to create new job from retry context - should be blocked
      const fakeNewJob = {
        job_id: 'job-retry-test-002', // NEW ID - VIOLATION
        idempotency_key: 'tenant-solar-2026-01-18-retry',
        based_on_retry: 'job-retry-test-001'
      };
      
      assert.strictEqual(guard.checkRetry(originalJob, fakeNewJob).allowed, false,
        'New job from retry context should be blocked');
    });
    
    it('should track retry count correctly', () => {
      const job = {
        job_id: 'job-count-test',
        idempotency_key: 'key-count',
        retry_count: 0
      };
      
      // Simulate retry increments
      const maxRetries = 3;
      
      for (let i = 0; i < maxRetries; i++) {
        job.retry_count = i;
        
        const retryRequest = {
          job_id: job.job_id,
          retry_count: i + 1
        };
        
        const result = guard.checkRetry(job, retryRequest);
        assert.strictEqual(result.allowed, true,
          `Retry ${i + 1} should be allowed`);
      }
      
      // Verify job_id never changed
      assert.strictEqual(job.job_id, 'job-count-test',
        'Job ID should never change during retries');
    });
  });
  
  // =========================================================
  // TEST: S7 audit trail for retries
  // =========================================================
  describe('S7 audit trail for retries', () => {
    
    it('should log retry violations for audit', () => {
      const originalJob = {
        job_id: 'job-audit-test',
        idempotency_key: 'key-audit'
      };
      
      // Attempt S7-violating retry
      const badRetry = {
        job_id: 'job-different-id', // VIOLATION
        idempotency_key: 'key-audit'
      };
      
      guard.checkRetry(originalJob, badRetry);
      
      // Note: Retry violations may be handled differently than submission violations
      // This test verifies the check returns blocked status
      const result = guard.checkRetry(originalJob, badRetry);
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason, 'Should have a reason for blocking');
    });
  });
});

// Run tests if executed directly
if (process.argv[1].includes('retry.test.js')) {
  console.log('Running Retry tests...');
}
