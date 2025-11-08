/**
 * Generate HTML Report from Evaluation Results
 *
 * Usage:
 *   npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-2025-11-01.json
 */

import fs from 'fs'
import path from 'path'

type EvaluationResults = {
  mode: 'fast' | 'full'
  timestamp: string
  total_questions: number
  correct_tool: number
  correct_args: number
  correct_args_semantic?: number
  fully_correct: number
  fully_correct_semantic?: number
  accuracy: {
    tool_selection: number
    args_selection: number
    args_selection_semantic?: number
    overall: number
    overall_semantic?: number
  }
  results: Array<{
    question_id: number
    question: string
    expected_tool: string
    expected_args: Record<string, any>
    actual_tool: string | null
    actual_args: Record<string, any> | null
    tool_match: boolean
    args_match: boolean
    args_match_semantic?: boolean
    overall_correct: boolean
    overall_correct_semantic?: boolean
    routing_latency_ms: number
    error?: string
  }>
}

function generateHTMLReport(results: EvaluationResults): string {
  // Split into three groups
  const realErrors = results.results.filter(r => !r.overall_correct_semantic)
  const minorVariations = results.results.filter(r => r.overall_correct_semantic && !r.overall_correct)
  const failedQuestions = results.results.filter(r => !r.overall_correct)

  // Group by category (extract from question patterns)
  const byCategory = groupResultsByCategory(results.results)

  // Generate category breakdown
  const categoryRows = Object.entries(byCategory)
    .map(([category, categoryResults]) => {
      const correct = categoryResults.filter(r => r.overall_correct).length
      const total = categoryResults.length
      const percentage = total > 0 ? (correct / total) * 100 : 0
      const barWidth = percentage

      return `
        <tr>
          <td class="category-name">${category}</td>
          <td class="category-stats">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${barWidth}%"></div>
            </div>
          </td>
          <td class="category-score">${percentage.toFixed(0)}%</td>
          <td class="category-count">(${correct}/${total})</td>
        </tr>
      `
    })
    .join('')

  // Generate rows for real errors
  const errorRows = realErrors
    .map(q => {
      // Determine issue type (show semantic status)
      let issueType = ''
      let issueClass = ''
      if (!q.tool_match) {
        issueType = 'WRONG TOOL'
        issueClass = 'error-tool'
      } else if (q.overall_correct_semantic) {
        issueType = 'SEMANTIC MATCH ✨'
        issueClass = 'semantic-match'
      } else {
        issueType = 'WRONG ARGS'
        issueClass = 'error-args'
      }

      // Determine category for this question
      const category = determineCategory(q.question)

      return `
        <tr data-category="${category}" class="question-row">
          <td class="question-id">Q${q.question_id}</td>
          <td class="question-text">"${q.question}"</td>
          <td><span class="category-badge">${category}</span></td>
          <td class="issue-type ${issueClass}">${issueType}</td>
          <td class="details">
            <button onclick="toggleDetails(${q.question_id})" class="btn-details">
              View Details
            </button>
          </td>
        </tr>
        <tr id="details-${q.question_id}" class="details-row" data-category="${category}" style="display: none;">
          <td colspan="5">
            <div class="details-content">
              <div class="detail-section">
                <strong>📋 Test Expects (Tool):</strong> <code>${q.expected_tool}</code><br>
                <strong>🤖 AI Chose (Tool):</strong> <code>${q.actual_tool || 'null'}</code>
              </div>
              <div class="detail-section">
                <strong>📋 Test Expects (Arguments):</strong>
                <pre>${JSON.stringify(q.expected_args, null, 2)}</pre>
                <strong>🤖 AI Chose (Arguments):</strong>
                <pre>${JSON.stringify(q.actual_args, null, 2)}</pre>
              </div>
              ${q.error ? `<div class="error-message">Error: ${q.error}</div>` : ''}

              <div class="annotation-section">
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
                <strong style="color: #667eea; font-size: 14px;">📝 Your Feedback:</strong>
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin-top: 12px;">
                  <select
                    id="action-${q.question_id}"
                    class="action-dropdown"
                    onchange="saveFeedback(${q.question_id})"
                    style="padding: 8px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 14px; background: white; cursor: pointer;">
                    <option value="">Select action...</option>
                    <option value="fix_bug">🐛 Fix Bug</option>
                    <option value="update_golden_test">📋 Update Golden Test</option>
                    <option value="add_alias">🔗 Add Alias</option>
                    <option value="update_prompt">✏️ Update Prompt</option>
                    <option value="skip">⏭️ Skip (acceptable)</option>
                  </select>
                  <textarea
                    id="comment-${q.question_id}"
                    class="comment-field"
                    onchange="saveFeedback(${q.question_id})"
                    placeholder="Add your notes about this failure..."
                    style="padding: 8px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 14px; min-height: 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; resize: vertical;"></textarea>
                </div>
              </div>
            </div>
          </td>
        </tr>
      `
    })
    .join('')

  // Generate rows for minor variations (semantic matches)
  const minorVariationRows = minorVariations
    .map(q => {
      const issueType = 'SEMANTIC MATCH ✨'
      const issueClass = 'semantic-match'
      const category = determineCategory(q.question)

      return `
        <tr data-category="${category}" class="question-row">
          <td class="question-id">Q${q.question_id}</td>
          <td class="question-text">"${q.question}"</td>
          <td><span class="category-badge">${category}</span></td>
          <td class="issue-type ${issueClass}">${issueType}</td>
          <td class="details">
            <button onclick="toggleDetails(${q.question_id})" class="btn-details">
              View Details
            </button>
          </td>
        </tr>
        <tr id="details-${q.question_id}" class="details-row" data-category="${category}" style="display: none;">
          <td colspan="5">
            <div class="details-content">
              <div class="detail-section">
                <strong>📋 Test Expects (Tool):</strong> <code>${q.expected_tool}</code><br>
                <strong>🤖 AI Chose (Tool):</strong> <code>${q.actual_tool || 'null'}</code>
              </div>
              <div class="detail-section">
                <strong>📋 Test Expects (Arguments):</strong>
                <pre>${JSON.stringify(q.expected_args, null, 2)}</pre>
                <strong>🤖 AI Chose (Arguments):</strong>
                <pre>${JSON.stringify(q.actual_args, null, 2)}</pre>
              </div>
              <div class="detail-section" style="background: #f0f9ff; padding: 12px; border-radius: 6px; border-left: 4px solid #667eea;">
                <strong>✨ Why this is acceptable:</strong><br>
                ${q.args_match ? 'Perfect match!' : 'This uses equivalent metric names or acceptable year ranges for open-ended questions.'}
              </div>

              <div class="annotation-section">
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
                <strong style="color: #667eea; font-size: 14px;">📝 Your Feedback:</strong>
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin-top: 12px;">
                  <select
                    id="action-${q.question_id}"
                    class="action-dropdown"
                    onchange="saveFeedback(${q.question_id})"
                    style="padding: 8px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 14px; background: white; cursor: pointer;">
                    <option value="">Select action...</option>
                    <option value="fix_bug">🐛 Fix Bug</option>
                    <option value="update_golden_test">📋 Update Golden Test</option>
                    <option value="add_alias">🔗 Add Alias</option>
                    <option value="update_prompt">✏️ Update Prompt</option>
                    <option value="skip">⏭️ Skip (acceptable)</option>
                  </select>
                  <textarea
                    id="comment-${q.question_id}"
                    class="comment-field"
                    onchange="saveFeedback(${q.question_id})"
                    placeholder="Add your notes about this failure..."
                    style="padding: 8px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 14px; min-height: 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; resize: vertical;"></textarea>
                </div>
              </div>
            </div>
          </td>
        </tr>
      `
    })
    .join('')

  // Get unique categories from failed questions
  const failedCategories = [...new Set(failedQuestions.map(q => determineCategory(q.question)))]
  const errorCategoryFilters = failedCategories.map(cat =>
    `<button class="filter-btn" onclick="filterErrorsByCategory('${cat}')" data-category="${cat}">${cat}</button>`
  ).join('')
  const variationCategoryFilters = failedCategories.map(cat =>
    `<button class="filter-btn" onclick="filterVariationsByCategory('${cat}')" data-category="${cat}">${cat}</button>`
  ).join('')

  const avgLatency = results.results.reduce((sum, r) => sum + r.routing_latency_ms, 0) / results.results.length

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Evaluation Report - ${new Date(results.timestamp).toLocaleDateString()}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
      color: #2d3748;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .header .subtitle {
      font-size: 16px;
      opacity: 0.9;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 24px;
      padding: 40px;
      background: #f7fafc;
    }

    .metric-card {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      text-align: center;
      transition: transform 0.2s;
    }

    .metric-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    .metric-label {
      font-size: 14px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 48px;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .metric-detail {
      font-size: 14px;
      color: #a0aec0;
      margin-top: 8px;
    }

    .section {
      padding: 40px;
    }

    .section-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .section-title::before {
      content: '';
      width: 4px;
      height: 28px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }

    th {
      background: #f7fafc;
      padding: 16px;
      text-align: left;
      font-weight: 600;
      color: #4a5568;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #e2e8f0;
    }

    td {
      padding: 16px;
      border-bottom: 1px solid #e2e8f0;
    }

    tr:hover {
      background: #f7fafc;
    }

    .category-name {
      font-weight: 600;
      color: #2d3748;
    }

    .category-stats {
      width: 300px;
    }

    .progress-bar {
      background: #e2e8f0;
      height: 24px;
      border-radius: 12px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
    }

    .category-score {
      font-weight: 700;
      font-size: 18px;
      color: #667eea;
    }

    .category-count {
      color: #718096;
      font-size: 14px;
    }

    .question-id {
      font-weight: 700;
      color: #667eea;
    }

    .question-text {
      max-width: 400px;
      color: #2d3748;
    }

    .issue-type {
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      text-transform: uppercase;
    }

    .error-tool {
      background: #fed7d7;
      color: #c53030;
    }

    .error-args {
      background: #feebc8;
      color: #c05621;
    }

    .semantic-match {
      background: linear-gradient(135deg, #d4e4ff 0%, #e9d5ff 100%);
      color: #5b21b6;
      font-weight: 600;
    }

    .btn-details {
      background: #667eea;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s;
    }

    .btn-details:hover {
      background: #764ba2;
    }

    .details-row {
      background: #f7fafc;
    }

    .details-content {
      padding: 24px;
      background: white;
      border-radius: 8px;
      margin: 8px;
    }

    .detail-section {
      margin-bottom: 16px;
    }

    .detail-section strong {
      color: #4a5568;
      display: inline-block;
      margin-bottom: 4px;
    }

    code {
      background: #edf2f7;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      color: #2d3748;
    }

    pre {
      background: #edf2f7;
      padding: 12px;
      border-radius: 8px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin-top: 8px;
      color: #2d3748;
    }

    .error-message {
      background: #fed7d7;
      color: #c53030;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid #c53030;
      margin-top: 16px;
    }

    .footer {
      padding: 24px 40px;
      background: #f7fafc;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #718096;
      font-size: 14px;
    }

    .filters {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .filter-btn {
      background: white;
      border: 2px solid #e2e8f0;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #4a5568;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      border-color: #667eea;
      color: #667eea;
    }

    .filter-btn.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-color: transparent;
      color: white;
    }

    .category-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      background: #e2e8f0;
      color: #4a5568;
    }

    @media (max-width: 768px) {
      .metrics {
        grid-template-columns: 1fr;
      }

      .category-stats {
        width: 100%;
      }

      .section {
        padding: 24px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Evaluation Report</h1>
      <p class="subtitle">Generated: ${new Date(results.timestamp).toLocaleString()}</p>
      <button onclick="saveAnnotatedHTML()" style="margin-top: 16px; background: white; color: #667eea; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        💾 Save Feedback to HTML
      </button>
    </div>

    <div class="metrics">
      <div class="metric-card">
        <div class="metric-label">Tool Accuracy</div>
        <div class="metric-value">${results.accuracy.tool_selection.toFixed(0)}%</div>
        <div class="metric-detail">${results.correct_tool}/${results.total_questions} correct</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Exact Match</div>
        <div class="metric-value">${results.accuracy.overall.toFixed(0)}%</div>
        <div class="metric-detail">${results.fully_correct}/${results.total_questions} fully correct</div>
      </div>

      <div class="metric-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <div class="metric-label">Semantic Match ✨</div>
        <div class="metric-value">${(results.accuracy.overall_semantic || results.accuracy.overall).toFixed(0)}%</div>
        <div class="metric-detail">${results.fully_correct_semantic || results.fully_correct}/${results.total_questions} correct</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Avg Latency</div>
        <div class="metric-value">${avgLatency.toFixed(0)}<span style="font-size: 24px;">ms</span></div>
        <div class="metric-detail">Routing time</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Accuracy by Category</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Progress</th>
            <th>Score</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
    </div>

    ${realErrors.length > 0 || minorVariations.length > 0 ? `
    <div style="background: #f7fafc; border-left: 4px solid #4299e1; padding: 16px; margin: 24px 0; border-radius: 6px;">
      <strong>📖 Understanding the Results:</strong>
      <p style="margin: 8px 0 0 0; color: #2d3748;">
        • <strong>📋 Test Expects</strong> = What the golden test says is correct (created by humans, can have errors)<br>
        • <strong>🤖 AI Chose</strong> = What the AI actually returned (what production would do)<br>
        • When they differ, check if the AI is wrong OR if the test has an error!
      </p>
    </div>
    ` : ''}

    ${realErrors.length > 0 ? `
    <div class="section">
      <h2 class="section-title">⚠️ Needs Attention (<span id="error-count">${realErrors.length}</span>)</h2>
      <p style="color: #e53e3e; margin-bottom: 16px;">These questions have wrong tool selection or semantically incorrect arguments.</p>
      <div class="filters">
        <button class="filter-btn active" onclick="filterErrorsByCategory('all')" data-category="all">All</button>
        ${errorCategoryFilters}
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Question</th>
            <th>Category</th>
            <th>Issue</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody id="errors-body">
          ${errorRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${minorVariations.length > 0 ? `
    <div class="section">
      <h2 class="section-title">✨ Minor Variations (<span id="variation-count">${minorVariations.length}</span>)</h2>
      <p style="color: #667eea; margin-bottom: 16px;">These questions are semantically correct but use different metric aliases or flexible year ranges.</p>
      <div class="filters">
        <button class="filter-btn active" onclick="filterVariationsByCategory('all')" data-category="all">All</button>
        ${variationCategoryFilters}
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Question</th>
            <th>Category</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody id="variations-body">
          ${minorVariationRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${realErrors.length === 0 && minorVariations.length === 0 ? `
    <div class="section">
      <h2 class="section-title">🎉 Perfect Score!</h2>
      <p style="color: #48bb78; font-size: 18px;">All questions answered correctly!</p>
    </div>
    ` : ''}

    <div class="footer">
      Fin Quote Evaluation Report | Mode: ${results.mode} | Questions: ${results.total_questions}
    </div>
  </div>

  <!-- Feedback storage embedded in HTML -->
  <script id="feedback-data" type="application/json">
  {
    "evaluation_file": "${path.basename(resultsPath)}",
    "timestamp": "${new Date().toISOString()}",
    "annotations": []
  }
  </script>

  <script>
    // Load feedback from embedded storage on page load
    function loadFeedback() {
      const feedbackScript = document.getElementById('feedback-data');
      const feedback = JSON.parse(feedbackScript.textContent);

      feedback.annotations.forEach(annotation => {
        const actionSelect = document.getElementById(\`action-\${annotation.question_id}\`);
        const commentField = document.getElementById(\`comment-\${annotation.question_id}\`);

        if (actionSelect) actionSelect.value = annotation.action || '';
        if (commentField) commentField.value = annotation.comment || '';
      });
    }

    // Save feedback to embedded storage
    function saveFeedback(questionId) {
      const actionSelect = document.getElementById(\`action-\${questionId}\`);
      const commentField = document.getElementById(\`comment-\${questionId}\`);

      const action = actionSelect.value;
      const comment = commentField.value;

      // Get current feedback data
      const feedbackScript = document.getElementById('feedback-data');
      const feedback = JSON.parse(feedbackScript.textContent);

      // Find or create annotation for this question
      let annotation = feedback.annotations.find(a => a.question_id === questionId);
      if (!annotation) {
        annotation = { question_id: questionId };
        feedback.annotations.push(annotation);
      }

      // Update annotation
      annotation.action = action;
      annotation.comment = comment;
      annotation.updated_at = new Date().toISOString();

      // Remove annotation if both fields are empty
      if (!action && !comment) {
        feedback.annotations = feedback.annotations.filter(a => a.question_id !== questionId);
      }

      // Update timestamp
      feedback.timestamp = new Date().toISOString();

      // Save back to script tag
      feedbackScript.textContent = JSON.stringify(feedback, null, 2);

      // Visual feedback
      const container = actionSelect.closest('.annotation-section');
      container.style.background = '#f0fdf4';
      setTimeout(() => {
        container.style.background = '';
      }, 500);
    }

    // Save annotated HTML file
    function saveAnnotatedHTML() {
      // Get the entire HTML document with updated feedback
      const htmlContent = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;

      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '${path.basename(resultsPath).replace('.json', '-annotated.html')}';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show success message
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = '✅ Saved!';
      btn.style.background = '#48bb78';
      btn.style.color = 'white';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = 'white';
        btn.style.color = '#667eea';
      }, 2000);
    }

    // Load feedback on page load
    document.addEventListener('DOMContentLoaded', loadFeedback);

    function toggleDetails(questionId) {
      const row = document.getElementById('details-' + questionId);
      if (row.style.display === 'none') {
        row.style.display = 'table-row';
      } else {
        row.style.display = 'none';
      }
    }

    function filterErrorsByCategory(category) {
      const container = document.getElementById('errors-body');
      if (!container) return;

      const section = container.closest('.section');
      const buttons = section.querySelectorAll('.filter-btn');

      // Update button states
      buttons.forEach(btn => {
        if (btn.dataset.category === category) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Filter rows
      const questionRows = container.querySelectorAll('.question-row');
      let visibleCount = 0;

      questionRows.forEach(row => {
        const rowCategory = row.getAttribute('data-category');
        const detailsRow = row.nextElementSibling; // The details row immediately follows

        if (category === 'all' || rowCategory === category) {
          row.style.display = 'table-row';
          if (detailsRow && detailsRow.classList.contains('details-row')) {
            // Keep details visible if they were visible, hidden if hidden
            // Just make sure they're not forced to display:none by category filter
            if (detailsRow.style.display !== 'none') {
              detailsRow.style.display = 'table-row';
            }
          }
          visibleCount++;
        } else {
          row.style.display = 'none';
          if (detailsRow && detailsRow.classList.contains('details-row')) {
            detailsRow.style.display = 'none';
          }
        }
      });

      // Update count
      const countElement = document.getElementById('error-count');
      if (countElement) countElement.textContent = visibleCount;
    }

    function filterVariationsByCategory(category) {
      const container = document.getElementById('variations-body');
      if (!container) return;

      const section = container.closest('.section');
      const buttons = section.querySelectorAll('.filter-btn');

      // Update button states
      buttons.forEach(btn => {
        if (btn.dataset.category === category) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Filter rows
      const questionRows = container.querySelectorAll('.question-row');
      let visibleCount = 0;

      questionRows.forEach(row => {
        const rowCategory = row.getAttribute('data-category');
        const detailsRow = row.nextElementSibling; // The details row immediately follows

        if (category === 'all' || rowCategory === category) {
          row.style.display = 'table-row';
          if (detailsRow && detailsRow.classList.contains('details-row')) {
            // Keep details visible if they were visible, hidden if hidden
            if (detailsRow.style.display !== 'none') {
              detailsRow.style.display = 'table-row';
            }
          }
          visibleCount++;
        } else {
          row.style.display = 'none';
          if (detailsRow && detailsRow.classList.contains('details-row')) {
            detailsRow.style.display = 'none';
          }
        }
      });

      // Update count
      const countElement = document.getElementById('variation-count');
      if (countElement) countElement.textContent = visibleCount;
    }
  </script>
</body>
</html>
  `
}

function determineCategory(question: string): string {
  const q = question.toLowerCase()

  if (q.includes('revenue') || q.includes('profit') ||
      q.includes('earnings') || q.includes('eps') ||
      q.includes('cash flow') || q.includes('assets') ||
      q.includes('liabilities') || q.includes('equity') ||
      q.includes('margin') || q.includes('roe') || q.includes('roa')) {
    return 'Financials'
  } else if (q.includes('price') || q.includes('stock') ||
             q.includes('trading')) {
    return 'Prices'
  } else if (q.includes('risk') || q.includes('competition') ||
             q.includes('strategy') || q.includes('search')) {
    return 'Search Filings'
  } else if (q.includes('filing') || q.includes('10-k') ||
             q.includes('10-q') || q.includes('report')) {
    return 'List Filings'
  } else {
    return 'Other'
  }
}

function groupResultsByCategory(results: any[]): Record<string, any[]> {
  const categories: Record<string, any[]> = {
    'Financials': [],
    'Prices': [],
    'Search Filings': [],
    'List Filings': [],
    'Other': []
  }

  results.forEach(result => {
    const category = determineCategory(result.question)
    categories[category].push(result)
  })

  // Remove empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([_, results]) => results.length > 0)
  )
}

// Main execution
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('❌ Usage: npx tsx scripts/generate-html-report.ts <path-to-results.json>')
  console.error('   Example: npx tsx scripts/generate-html-report.ts test-data/test-results/eval-fast-2025-11-01.json')
  process.exit(1)
}

const resultsPath = args[0]

if (!fs.existsSync(resultsPath)) {
  console.error(`❌ File not found: ${resultsPath}`)
  process.exit(1)
}

console.log(`📊 Generating HTML report from: ${resultsPath}`)

const results: EvaluationResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'))
const html = generateHTMLReport(results)

// Save HTML file
const outputPath = resultsPath.replace('.json', '.html')
fs.writeFileSync(outputPath, html)

console.log(`✅ HTML report generated: ${outputPath}`)
console.log(`🌐 Open in browser: file://${path.resolve(outputPath)}`)
