#!/usr/bin/env node

/**
 * ============================================================
 * HELLO JOB - AGENT ZERO VALIDATION SCRIPT
 * ============================================================
 * Run this script to verify KuasaTurbo is operational
 * 
 * Usage: npm run hello
 * Or: node scripts/hello-job.js
 * ============================================================
 */

import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║             KUASATURBO - HELLO JOB TEST                       ║
╚═══════════════════════════════════════════════════════════════╝
`);

async function runHelloJob() {
  const tests = [];
  
  // ─────────────────────────────────────────────────────────────
  // Test 1: Health Check
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Health Check');
  console.log('────────────────────');
  
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = await healthRes.json();
    
    if (health.status === 'healthy' && health.layer === 0) {
      console.log('✅ Health check passed');
      console.log(`   Layer: ${health.layer}`);
      console.log(`   S7 Enforced: ${health.s7_enforced}`);
      console.log(`   TTL: ${health.ttl_seconds}s`);
      tests.push({ name: 'Health Check', passed: true });
    } else {
      console.log('❌ Health check failed');
      tests.push({ name: 'Health Check', passed: false });
    }
  } catch (error) {
    console.log(`❌ Health check error: ${error.message}`);
    console.log('   Make sure the server is running: npm start');
    tests.push({ name: 'Health Check', passed: false, error: error.message });
    process.exit(1);
  }
  
  console.log('');
  
  // ─────────────────────────────────────────────────────────────
  // Test 2: Invalid Job Type Rejection
  // ─────────────────────────────────────────────────────────────
  console.log('Test 2: Invalid Job Type Rejection');
  console.log('───────────────────────────────────');
  
  try {
    const res = await fetch(`${BASE_URL}/api/jobs/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_type: 'invalid_type',
        transform_type: 'test'
      })
    });
    
    if (res.status === 400) {
      console.log('✅ Invalid job type correctly rejected');
      tests.push({ name: 'Invalid Job Type Rejection', passed: true });
    } else {
      console.log(`❌ Expected 400, got ${res.status}`);
      tests.push({ name: 'Invalid Job Type Rejection', passed: false });
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    tests.push({ name: 'Invalid Job Type Rejection', passed: false });
  }
  
  console.log('');
  
  // ─────────────────────────────────────────────────────────────
  // Test 3: S7 Violation Detection
  // ─────────────────────────────────────────────────────────────
  console.log('Test 3: S7 Violation Detection');
  console.log('───────────────────────────────');
  
  try {
    const res = await fetch(`${BASE_URL}/api/jobs/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_type: 'z4_format_transform',
        transform_type: 'mortgage_eligibility_summary',
        previous_job_id: 'some-previous-job' // S7 VIOLATION
      })
    });
    
    const data = await res.json();
    
    if (res.status === 403 && data.error === 'S7_VIOLATION') {
      console.log('✅ S7 violation correctly detected and blocked');
      console.log(`   Reason: ${data.message}`);
      tests.push({ name: 'S7 Violation Detection', passed: true });
    } else {
      console.log(`❌ S7 violation not detected. Status: ${res.status}`);
      tests.push({ name: 'S7 Violation Detection', passed: false });
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    tests.push({ name: 'S7 Violation Detection', passed: false });
  }
  
  console.log('');
  
  // ─────────────────────────────────────────────────────────────
  // Test 4: Valid Job Submission (Mock)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 4: Valid Job Submission');
  console.log('────────────────────────────');
  
  try {
    // Create form data (without actual files for hello job)
    const formData = new FormData();
    formData.append('job_type', 'z4_format_transform');
    formData.append('transform_type', 'mortgage_eligibility_summary');
    formData.append('tenant_id', 'hello-test-tenant');
    formData.append('idempotency_key', `hello-test-${Date.now()}`);
    
    const res = await fetch(`${BASE_URL}/api/jobs/submit`, {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    
    if (res.status === 202 && data.job_id) {
      console.log('✅ Job submission accepted');
      console.log(`   Job ID: ${data.job_id}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Expires: ${data.expires_at}`);
      console.log(`   TTL: ${data.ttl_seconds}s (should be 86400 = 24h)`);
      
      // Check TTL is 24 hours
      if (data.ttl_seconds === 86400) {
        console.log('✅ TTL correctly set to 24 hours');
      } else {
        console.log(`⚠️ TTL is ${data.ttl_seconds}, expected 86400`);
      }
      
      tests.push({ name: 'Valid Job Submission', passed: true, job_id: data.job_id });
      
      // Store job_id for status check
      return { tests, job_id: data.job_id };
    } else {
      console.log(`❌ Submission failed: ${res.status}`);
      console.log(data);
      tests.push({ name: 'Valid Job Submission', passed: false });
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    tests.push({ name: 'Valid Job Submission', passed: false });
  }
  
  return { tests };
}

async function checkJobStatus(job_id) {
  console.log('');
  console.log('Test 5: Job Status Check');
  console.log('────────────────────────');
  
  try {
    const res = await fetch(`${BASE_URL}/api/jobs/${job_id}/status`);
    const data = await res.json();
    
    console.log(`✅ Status retrieved: ${data.status}`);
    console.log(`   Expires: ${data.expires_at}`);
    console.log(`   Time remaining: ${data.time_remaining_seconds}s`);
    
    return { name: 'Job Status Check', passed: true };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { name: 'Job Status Check', passed: false };
  }
}

async function main() {
  const { tests, job_id } = await runHelloJob();
  
  if (job_id) {
    // Wait a moment then check status
    await new Promise(r => setTimeout(r, 1000));
    const statusTest = await checkJobStatus(job_id);
    tests.push(statusTest);
  }
  
  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY                                ');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;
  
  for (const test of tests) {
    console.log(`${test.passed ? '✅' : '❌'} ${test.name}`);
  }
  
  console.log('');
  console.log(`Result: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('');
    console.log('🎉 KuasaTurbo is operational!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Test with actual file uploads');
    console.log('  2. Verify proof pack generation');
    console.log('  3. Test expiration enforcement');
    process.exit(0);
  } else {
    console.log('');
    console.log('⚠️ Some tests failed. Please check the issues above.');
    process.exit(1);
  }
}

main().catch(console.error);
