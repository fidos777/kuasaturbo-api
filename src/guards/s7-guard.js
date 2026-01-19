/**
 * ============================================================
 * S7 GUARD - NO CONTINUITY INVARIANT ENFORCEMENT
 * ============================================================
 * Constitutional AI Governance - Layer 0
 * 
 * Invariant S7: No Continuity
 * 
 * The substrate MUST NOT:
 * 1. Trigger subsequent jobs based on output
 * 2. Store state intended to influence future jobs
 * 3. Make follow-up decisions based on execution results
 * 4. Reference previous executions for decision-making
 * 5. Maintain session state across job boundaries
 * 6. Implement "memory" of previous interactions
 * 
 * VIOLATION: Immediate block, incident logged
 * ============================================================
 */

/**
 * S7 Guard - Enforces No Continuity Invariant
 */
export class S7Guard {
  constructor() {
    // Track active jobs to detect chaining attempts
    this.activeJobs = new Map();
    
    // Patterns that indicate continuity violation
    this.forbiddenPatterns = {
      // Field names that imply chaining
      fieldNames: [
        'previous_job_id',
        'depends_on',
        'parent_job',
        'triggered_by',
        'follows_from',
        'continuation_of',
        'chain_id',
        'workflow_id',
        'sequence_id',
        'step_number',
        'next_step',
        'previous_output',
        'last_result'
      ],
      
      // Content patterns that imply memory/continuity
      contentPatterns: [
        /based on (?:your |the )?previous/i,
        /as we discussed/i,
        /continuing from/i,
        /following up on/i,
        /as mentioned before/i,
        /remember (?:that|when)/i,
        /last time/i,
        /in our previous/i,
        /building on/i,
        /step \d+ of \d+/i,
        /next step/i,
        /workflow continues/i
      ]
    };
    
    // Violation log
    this.violations = [];
  }
  
  /**
   * Check job submission for S7 violations
   * @param {Object} submission - Job submission data
   * @returns {Object} { allowed: boolean, reason?: string, violation?: object }
   */
  checkSubmission(submission) {
    const violations = [];
    
    // Check 1: Explicit references to previous jobs
    if (submission.references_previous) {
      violations.push({
        type: 'EXPLICIT_REFERENCE',
        field: 'references_previous',
        value: submission.references_previous,
        rule: 'Jobs cannot reference previous job outputs'
      });
    }
    
    // Check 2: Forbidden field names
    for (const field of this.forbiddenPatterns.fieldNames) {
      if (submission[field] !== undefined) {
        violations.push({
          type: 'FORBIDDEN_FIELD',
          field: field,
          value: submission[field],
          rule: `Field '${field}' implies job chaining`
        });
      }
    }
    
    // Check 3: Check for chaining in metadata
    if (submission.metadata) {
      for (const field of this.forbiddenPatterns.fieldNames) {
        if (submission.metadata[field] !== undefined) {
          violations.push({
            type: 'FORBIDDEN_METADATA_FIELD',
            field: `metadata.${field}`,
            value: submission.metadata[field],
            rule: `Metadata field '${field}' implies job chaining`
          });
        }
      }
    }
    
    // Check 4: Content pattern analysis (if inputs are text)
    if (submission.prompt || submission.instructions) {
      const textToCheck = `${submission.prompt || ''} ${submission.instructions || ''}`;
      for (const pattern of this.forbiddenPatterns.contentPatterns) {
        if (pattern.test(textToCheck)) {
          violations.push({
            type: 'CONTINUITY_LANGUAGE',
            pattern: pattern.toString(),
            rule: 'Content contains language implying continuity/memory'
          });
        }
      }
    }
    
    // If violations found, log and reject
    if (violations.length > 0) {
      const violation = {
        timestamp: new Date().toISOString(),
        tenant_id: submission.tenant_id,
        idempotency_key: submission.idempotency_key,
        violations: violations
      };
      
      this.violations.push(violation);
      this.logViolation(violation);
      
      return {
        allowed: false,
        reason: `S7 Violation: ${violations[0].rule}`,
        violation: violation
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check job result for S7 violations (output inspection)
   * @param {Object} result - Job execution result
   * @returns {Object} { clean: boolean, warnings?: array }
   */
  checkResult(result) {
    const warnings = [];
    
    // Check output for forbidden patterns that might trigger follow-ups
    if (result.outputs) {
      for (const output of result.outputs) {
        // Check for "next step" recommendations
        if (output.content && typeof output.content === 'string') {
          for (const pattern of this.forbiddenPatterns.contentPatterns) {
            if (pattern.test(output.content)) {
              warnings.push({
                type: 'OUTPUT_CONTINUITY_LANGUAGE',
                output: output.name,
                pattern: pattern.toString(),
                warning: 'Output contains language that may imply follow-up actions'
              });
            }
          }
        }
        
        // Check for forbidden fields in structured output
        if (output.data && typeof output.data === 'object') {
          for (const field of this.forbiddenPatterns.fieldNames) {
            if (output.data[field] !== undefined) {
              warnings.push({
                type: 'OUTPUT_FORBIDDEN_FIELD',
                output: output.name,
                field: field,
                warning: `Output contains field '${field}' that implies continuity`
              });
            }
          }
        }
      }
    }
    
    return {
      clean: warnings.length === 0,
      warnings: warnings
    };
  }
  
  /**
   * Verify retry is for same job (not a new job)
   * @param {Object} originalJob - Original job record
   * @param {Object} retryRequest - Retry request
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  checkRetry(originalJob, retryRequest) {
    // Rule: Retry MUST use same job_id
    if (retryRequest.job_id !== originalJob.job_id) {
      return {
        allowed: false,
        reason: 'Retry must use same job_id (S7: no new job creation from retry)'
      };
    }
    
    // Rule: Retry MUST have same idempotency_key
    if (retryRequest.idempotency_key && 
        retryRequest.idempotency_key !== originalJob.idempotency_key) {
      return {
        allowed: false,
        reason: 'Retry must preserve idempotency_key (S7: no identity mutation)'
      };
    }
    
    // Rule: Retry cannot add new inputs
    if (retryRequest.additional_inputs || retryRequest.new_files) {
      return {
        allowed: false,
        reason: 'Retry cannot add new inputs (S7: no input evolution)'
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Log S7 violation for audit
   * @param {Object} violation - Violation details
   */
  logViolation(violation) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('🚨 S7 VIOLATION DETECTED');
    console.error('═══════════════════════════════════════════════════════════');
    console.error(`Timestamp: ${violation.timestamp}`);
    console.error(`Tenant: ${violation.tenant_id || 'unknown'}`);
    console.error('Violations:');
    for (const v of violation.violations) {
      console.error(`  - [${v.type}] ${v.rule}`);
      if (v.field) console.error(`    Field: ${v.field}`);
      if (v.value) console.error(`    Value: ${JSON.stringify(v.value)}`);
    }
    console.error('═══════════════════════════════════════════════════════════');
  }
  
  /**
   * Get all recorded violations
   * @returns {Array} List of violations
   */
  getViolations() {
    return [...this.violations];
  }
  
  /**
   * Clear violations (for testing)
   */
  clearViolations() {
    this.violations = [];
  }
  
  /**
   * Get S7 enforcement status
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      enabled: true,
      invariant: 'S7',
      name: 'No Continuity',
      description: 'Each job is atomic and independent. Continuity is a Qontrek concern.',
      total_violations: this.violations.length,
      forbidden_field_count: this.forbiddenPatterns.fieldNames.length,
      content_pattern_count: this.forbiddenPatterns.contentPatterns.length
    };
  }
}

// Export singleton for use across modules
export const s7Guard = new S7Guard();
export default S7Guard;
