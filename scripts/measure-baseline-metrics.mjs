import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('===================================');
console.log('BASELINE METRICS MEASUREMENT');
console.log('===================================\n');

// 1. Thumbs up/down ratio
console.log('1. USER FEEDBACK RATIO');
console.log('----------------------');

const { data: feedbackData, error: feedbackError } = await supabase
  .from('query_logs')
  .select('user_feedback')
  .not('user_feedback', 'is', null);

if (feedbackError) {
  console.error('Error fetching feedback:', feedbackError);
} else {
  const thumbsUp = feedbackData.filter(r => r.user_feedback === 'thumbs_up').length;
  const thumbsDown = feedbackData.filter(r => r.user_feedback === 'thumbs_down').length;
  const total = feedbackData.length;

  console.log(`Total queries with feedback: ${total}`);
  console.log(`Thumbs up: ${thumbsUp} (${total > 0 ? (thumbsUp / total * 100).toFixed(1) : 0}%)`);
  console.log(`Thumbs down: ${thumbsDown} (${total > 0 ? (thumbsDown / total * 100).toFixed(1) : 0}%)`);
}

console.log('\n');

// 2. Average response time (last 7 days)
console.log('2. AVERAGE RESPONSE TIME (Last 7 Days)');
console.log('---------------------------------------');

const { data: latencyData, error: latencyError } = await supabase
  .from('query_logs')
  .select('tool_selection_latency_ms, tool_execution_latency_ms, answer_latency_ms')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

if (latencyError) {
  console.error('Error fetching latency:', latencyError);
} else {
  const totalLatencies = latencyData.map(r =>
    (r.tool_selection_latency_ms || 0) +
    (r.tool_execution_latency_ms || 0) +
    (r.answer_latency_ms || 0)
  );

  const avgTotal = totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length;
  const avgSelection = latencyData.reduce((a, r) => a + (r.tool_selection_latency_ms || 0), 0) / latencyData.length;
  const avgExecution = latencyData.reduce((a, r) => a + (r.tool_execution_latency_ms || 0), 0) / latencyData.length;
  const avgAnswer = latencyData.reduce((a, r) => a + (r.answer_latency_ms || 0), 0) / latencyData.length;

  console.log(`Total queries analyzed: ${latencyData.length}`);
  console.log(`Average total response time: ${avgTotal.toFixed(0)}ms`);
  console.log(`  - Tool selection: ${avgSelection.toFixed(0)}ms`);
  console.log(`  - Tool execution: ${avgExecution.toFixed(0)}ms`);
  console.log(`  - Answer generation: ${avgAnswer.toFixed(0)}ms`);
}

console.log('\n');

// 3. Error rate (last 7 days)
console.log('3. ERROR RATE (Last 7 Days)');
console.log('----------------------------');

const { data: errorData, error: errorQueryError } = await supabase
  .from('query_logs')
  .select('tool_error')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

if (errorQueryError) {
  console.error('Error fetching errors:', errorQueryError);
} else {
  const totalQueries = errorData.length;
  const queriesWithErrors = errorData.filter(r => r.tool_error !== null).length;
  const errorRate = totalQueries > 0 ? (queriesWithErrors / totalQueries * 100) : 0;

  console.log(`Total queries: ${totalQueries}`);
  console.log(`Queries with errors: ${queriesWithErrors}`);
  console.log(`Error rate: ${errorRate.toFixed(2)}%`);
}

console.log('\n');

// 4. Query volume by day (last 7 days)
console.log('4. QUERY VOLUME (Last 7 Days)');
console.log('------------------------------');

const { data: volumeData, error: volumeError } = await supabase
  .from('query_logs')
  .select('created_at')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  .order('created_at', { ascending: true });

if (volumeError) {
  console.error('Error fetching volume:', volumeError);
} else {
  // Group by day
  const byDay = volumeData.reduce((acc, r) => {
    const day = r.created_at.split('T')[0];
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byDay).forEach(([day, count]) => {
    console.log(`${day}: ${count} queries`);
  });

  console.log(`\nTotal: ${volumeData.length} queries over 7 days`);
  console.log(`Average: ${(volumeData.length / 7).toFixed(1)} queries/day`);
}

console.log('\n');

// 5. Tool usage distribution
console.log('5. TOOL USAGE DISTRIBUTION');
console.log('--------------------------');

const { data: toolData, error: toolError } = await supabase
  .from('query_logs')
  .select('tool_selected')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

if (toolError) {
  console.error('Error fetching tool usage:', toolError);
} else {
  const toolCounts = toolData.reduce((acc, r) => {
    acc[r.tool_selected] = (acc[r.tool_selected] || 0) + 1;
    return acc;
  }, {});

  const total = toolData.length;
  Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).forEach(([tool, count]) => {
    console.log(`${tool}: ${count} (${(count / total * 100).toFixed(1)}%)`);
  });
}

console.log('\n');

// 6. Sample recent queries for manual review
console.log('6. SAMPLE QUERIES FOR MANUAL REVIEW');
console.log('------------------------------------');
console.log('Fetching 10 random queries from last 7 days...\n');

const { data: sampleData, error: sampleError } = await supabase
  .from('query_logs')
  .select('id, user_question, tool_selected, answer_generated, user_feedback')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  .limit(10);

if (sampleError) {
  console.error('Error fetching samples:', sampleError);
} else {
  sampleData.forEach((query, i) => {
    console.log(`${i + 1}. ID: ${query.id}`);
    console.log(`   Question: ${query.user_question}`);
    console.log(`   Tool: ${query.tool_selected}`);
    console.log(`   Feedback: ${query.user_feedback || 'none'}`);
    console.log(`   Answer: ${query.answer_generated.substring(0, 100)}...`);
    console.log('');
  });

  console.log('To manually review accuracy:');
  console.log('1. For each query above, check if the answer is factually correct');
  console.log('2. Check: numbers match data, years exist, citations are real');
  console.log('3. Document accuracy rate: (correct / 10) * 100%');
}

console.log('\n');

// Summary and next steps
console.log('===================================');
console.log('BASELINE SUMMARY');
console.log('===================================\n');

const today = new Date().toISOString().split('T')[0];

console.log(`Baseline Metrics (as of ${today}):`);
console.log('----------------------------------');
if (!feedbackError && feedbackData.length > 0) {
  const thumbsUp = feedbackData.filter(r => r.user_feedback === 'thumbs_up').length;
  const total = feedbackData.length;
  console.log(`✓ Thumbs up rate: ${(thumbsUp / total * 100).toFixed(1)}%`);
}
if (!latencyError && latencyData.length > 0) {
  const avgTotal = latencyData.map(r =>
    (r.tool_selection_latency_ms || 0) +
    (r.tool_execution_latency_ms || 0) +
    (r.answer_latency_ms || 0)
  ).reduce((a, b) => a + b, 0) / latencyData.length;
  console.log(`✓ Average response time: ${avgTotal.toFixed(0)}ms`);
}
if (!errorQueryError && errorData.length > 0) {
  const errorRate = (errorData.filter(r => r.tool_error !== null).length / errorData.length * 100);
  console.log(`✓ Error rate: ${errorRate.toFixed(2)}%`);
}
console.log(`✓ Manual accuracy check: ??% (review samples above)`);

console.log('\n📋 Next Steps:');
console.log('1. Review the 10 sample queries above and calculate accuracy');
console.log('2. Document these baseline metrics');
console.log('3. Run the data model migration (data/add-validation-columns.sql)');
console.log('4. Proceed to Phase 0: Prompt improvements');
