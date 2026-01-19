/**
 * ============================================================
 * JOB VALIDATOR
 * ============================================================
 * Validates job submissions against Phase 1α constraints
 * ============================================================
 */

const VALID_JOB_TYPES = ['z4_format_transform'];

const VALID_TRANSFORM_TYPES = [
  'mortgage_eligibility_summary',
  'solar_proposal_draft'
];

const FILE_CONSTRAINTS = {
  mortgage_eligibility_summary: {
    required: ['payslip'],
    optional: ['ic_front', 'bank_statement'],
    maxFiles: 3,
    maxTotalSize: 20 * 1024 * 1024 // 20MB
  },
  solar_proposal_draft: {
    required: ['electricity_bill', 'roof_photo'],
    optional: ['location_info'],
    maxFiles: 3,
    maxTotalSize: 15 * 1024 * 1024 // 15MB
  }
};

/**
 * Validate job request
 * @param {Object} request - Job submission request
 * @returns {Object} { valid: boolean, errors?: array }
 */
export function validateJobRequest(request) {
  const errors = [];
  
  // Check job type
  if (!request.job_type) {
    errors.push({ field: 'job_type', message: 'Job type is required' });
  } else if (!VALID_JOB_TYPES.includes(request.job_type)) {
    errors.push({ 
      field: 'job_type', 
      message: `Invalid job type. Allowed: ${VALID_JOB_TYPES.join(', ')}` 
    });
  }
  
  // Check transform type
  if (!request.transform_type) {
    errors.push({ field: 'transform_type', message: 'Transform type is required' });
  } else if (!VALID_TRANSFORM_TYPES.includes(request.transform_type)) {
    errors.push({ 
      field: 'transform_type', 
      message: `Invalid transform type. Allowed: ${VALID_TRANSFORM_TYPES.join(', ')}` 
    });
  }
  
  // Check files if transform type is valid
  if (request.transform_type && VALID_TRANSFORM_TYPES.includes(request.transform_type)) {
    const constraints = FILE_CONSTRAINTS[request.transform_type];
    const files = request.files || [];
    
    // Check file count
    if (files.length > constraints.maxFiles) {
      errors.push({ 
        field: 'files', 
        message: `Too many files. Maximum: ${constraints.maxFiles}` 
      });
    }
    
    // Check total size
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > constraints.maxTotalSize) {
      errors.push({ 
        field: 'files', 
        message: `Total file size exceeds limit: ${constraints.maxTotalSize / (1024 * 1024)}MB` 
      });
    }
    
    // Check required files (by fieldname)
    const fileNames = files.map(f => f.fieldname);
    for (const required of constraints.required) {
      if (!fileNames.includes(required)) {
        errors.push({ 
          field: 'files', 
          message: `Required file missing: ${required}` 
        });
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

export default { validateJobRequest };
