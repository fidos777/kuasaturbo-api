/**
 * ============================================================
 * TOKEN COUNTER - TOKEN USAGE & COST METRICS
 * ============================================================
 * Calculates token usage and cost metrics for job executions
 * 
 * IMPORTANT DISCLAIMER:
 * Token metrics are cost signals only.
 * Lower cost does NOT mean higher quality or correctness.
 * AI efficiency ≠ AI accuracy.
 * ============================================================
 */

// Pricing per 1M tokens (as of Jan 2026)
const PRICING = {
  'claude-3-opus-20240229': {
    input: 15.00,
    output: 75.00
  },
  'claude-3-sonnet-20240229': {
    input: 3.00,
    output: 15.00
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00
  },
  // Default fallback
  'default': {
    input: 3.00,
    output: 15.00
  }
};

// Exchange rate
const USD_TO_MYR = parseFloat(process.env.USD_TO_MYR_RATE || '4.65');

/**
 * Token Counter class
 */
export class TokenCounter {
  constructor() {
    this.disclaimer = 'Token metrics are cost signals only. Lower cost does NOT mean higher quality or correctness.';
  }
  
  /**
   * Calculate token metrics from execution result
   * @param {Object} result - Execution result with token_usage
   * @returns {Object} Complete token metrics
   */
  calculate(result) {
    const tokenUsage = result.token_usage || {};
    const model = tokenUsage.model_used || 'default';
    const pricing = PRICING[model] || PRICING['default'];
    
    // Token counts
    const tokensIn = tokenUsage.tokens_in || 0;
    const tokensOut = tokenUsage.tokens_out || 0;
    const totalTokens = tokensIn + tokensOut;
    
    // Cost calculation
    const inputCostUsd = (tokensIn / 1_000_000) * pricing.input;
    const outputCostUsd = (tokensOut / 1_000_000) * pricing.output;
    const totalCostUsd = inputCostUsd + outputCostUsd;
    const totalCostMyr = totalCostUsd * USD_TO_MYR;
    
    // Timing
    const executionTimeMs = result.execution_time_ms || 0;
    
    // Build metrics object - flat structure for UI compatibility
    const metrics = {
      // Flat token counts (required by UI)
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      total_tokens: totalTokens,
      model_used: model,

      // Timing
      timing: {
        execution_time_ms: executionTimeMs,
        total_time_ms: executionTimeMs
      },

      // Cost
      cost: {
        input_cost_usd: round(inputCostUsd, 6),
        output_cost_usd: round(outputCostUsd, 6),
        total_cost_usd: round(totalCostUsd, 6),
        total_cost_myr: round(totalCostMyr, 4),
        exchange_rate_usd_myr: USD_TO_MYR,
        pricing_tier: 'standard'
      },

      // Efficiency (basic)
      efficiency: {
        tokens_per_second: executionTimeMs > 0
          ? round(totalTokens / (executionTimeMs / 1000), 2)
          : null,
        cost_category: this.getCostCategory(totalCostMyr),
        relative_efficiency_score: executionTimeMs > 0
          ? Math.min(1, 5000 / executionTimeMs) // Simple score based on speed
          : null
      },

      // Disclaimer
      disclaimer: this.disclaimer,
      disclaimer_short: 'Cost ≠ Quality'
    };

    return metrics;
  }
  
  /**
   * Get cost category for display
   * @param {number} costMyr - Cost in MYR
   * @returns {string} Category: low | medium | heavy
   */
  getCostCategory(costMyr) {
    if (costMyr < 0.50) return 'low';
    if (costMyr < 2.00) return 'medium';
    return 'heavy';
  }
  
  /**
   * Get cost display color
   * @param {string} category - Cost category
   * @returns {string} Color code
   */
  getCostColor(category) {
    const colors = {
      low: '🟢',
      medium: '🟡',
      heavy: '🔴'
    };
    return colors[category] || '⚪';
  }
  
  /**
   * Format metrics for display
   * @param {Object} metrics - Token metrics
   * @returns {string} Formatted string
   */
  formatForDisplay(metrics) {
    const color = this.getCostColor(metrics.efficiency.cost_category);

    return `
Token Usage: ${metrics.total_tokens.toLocaleString()} tokens
  - Input:  ${metrics.tokens_in.toLocaleString()}
  - Output: ${metrics.tokens_out.toLocaleString()}

Cost: ${color} ${metrics.efficiency.cost_category.toUpperCase()}
  - USD: $${metrics.cost.total_cost_usd.toFixed(4)}
  - MYR: RM ${metrics.cost.total_cost_myr.toFixed(2)}

Model: ${metrics.model_used}
Time: ${metrics.timing.execution_time_ms}ms

⚠️ ${metrics.disclaimer_short}: ${metrics.disclaimer}
`;
  }
}

/**
 * Round number to specified decimal places
 */
function round(num, decimals) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// Export singleton
export const tokenCounter = new TokenCounter();
export default TokenCounter;
