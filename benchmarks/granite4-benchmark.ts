const OLLAMA_BASE_URL = 'http://localhost:11434/api';

interface BenchmarkResult {
  model: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  totalTime: number;
  tokensPerSecond: number;
  firstTokenTime: number;
  response: string;
}

const CODE_TASKS = [
  {
    name: 'Code Explanation',
    prompt: `Explain this TypeScript code briefly:
\`\`\`typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
      return await response.json();
    } catch (error) {
      if (i === maxRetries) throw error;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Unreachable');
}
\`\`\``
  },
  {
    name: 'Bug Detection',
    prompt: `Find the bug in this code:
\`\`\`javascript
function findDuplicates(arr) {
  const seen = {};
  const duplicates = [];
  for (let i = 0; i <= arr.length; i++) {
    if (seen[arr[i]]) {
      duplicates.push(arr[i]);
    }
    seen[arr[i]] = true;
  }
  return duplicates;
}
\`\`\``
  },
  {
    name: 'Code Generation',
    prompt: 'Write a TypeScript function that debounces another function with configurable delay. Include types.'
  },
  {
    name: 'Refactoring',
    prompt: `Refactor this code to be more readable:
\`\`\`javascript
function p(d){return d.filter(x=>x.a>0).map(x=>({...x,t:x.a*x.p})).sort((a,b)=>b.t-a.t).slice(0,5)}
\`\`\``
  }
];

async function streamGenerate(model: string, prompt: string): Promise<{
  response: string;
  totalTime: number;
  firstTokenTime: number;
  evalCount: number;
}> {
  const startTime = performance.now();
  let firstTokenTime = 0;
  let response = '';
  let evalCount = 0;

  const res = await fetch(`${OLLAMA_BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      options: {
        temperature: 0.1,
        num_predict: 256
      }
    })
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.response) {
          if (!firstTokenTime) {
            firstTokenTime = performance.now() - startTime;
          }
          response += data.response;
        }
        if (data.eval_count) {
          evalCount = data.eval_count;
        }
      } catch {}
    }
  }

  return {
    response,
    totalTime: performance.now() - startTime,
    firstTokenTime,
    evalCount
  };
}

async function runBenchmark(model: string): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Benchmarking: ${model}`);
  console.log(`${'='.repeat(60)}\n`);

  // Warmup
  console.log('Warming up...');
  await streamGenerate(model, 'Hello');

  for (const task of CODE_TASKS) {
    console.log(`\n📝 ${task.name}...`);

    const { response, totalTime, firstTokenTime, evalCount } = await streamGenerate(model, task.prompt);

    const tokensPerSecond = evalCount / (totalTime / 1000);

    results.push({
      model,
      task: task.name,
      inputTokens: Math.round(task.prompt.length / 4),
      outputTokens: evalCount,
      totalTime,
      tokensPerSecond,
      firstTokenTime,
      response: response.slice(0, 300) + (response.length > 300 ? '...' : '')
    });

    console.log(`   ⏱️  Total: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`   🚀 First token: ${firstTokenTime.toFixed(0)}ms`);
    console.log(`   📊 ${evalCount} tokens @ ${tokensPerSecond.toFixed(1)} tok/s`);
  }

  return results;
}

async function main() {
  const models = process.argv.slice(2);
  if (models.length === 0) {
    models.push('granite4:1b');
  }

  console.log('🔬 LLM Code Tasks Performance Benchmark');
  console.log('=======================================\n');

  // Check Ollama connection
  try {
    await fetch(`${OLLAMA_BASE_URL}/tags`);
  } catch (e) {
    console.error('❌ Cannot connect to Ollama. Make sure it is running.');
    process.exit(1);
  }

  const allResults: BenchmarkResult[][] = [];
  for (const model of models) {
    const results = await runBenchmark(model);
    allResults.push(results);
  }

  // Summary for each model
  for (const results of allResults) {
    const model = results[0]?.model || 'unknown';
    console.log('\n' + '='.repeat(60));
    console.log(`📊 SUMMARY: ${model}`);
    console.log('='.repeat(60));

    const avgTps = results.reduce((sum, r) => sum + r.tokensPerSecond, 0) / results.length;
    const avgFirstToken = results.reduce((sum, r) => sum + r.firstTokenTime, 0) / results.length;
    const totalTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);

    console.log(`Average tokens/sec: ${avgTps.toFixed(1)}`);
    console.log(`Average first token: ${avgFirstToken.toFixed(0)}ms`);
    console.log(`Total tokens generated: ${totalTokens}`);

    console.log('\n📋 Per-task results:');
    console.log('-'.repeat(60));
    for (const r of results) {
      console.log(`${r.task.padEnd(20)} | ${r.tokensPerSecond.toFixed(1).padStart(6)} tok/s | ${(r.totalTime/1000).toFixed(2).padStart(5)}s | ${r.outputTokens} tokens`);
    }
  }

  // Comparison table if multiple models
  if (allResults.length > 1) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPARISON TABLE');
    console.log('='.repeat(70));
    console.log(`${'Model'.padEnd(25)} | ${'Avg tok/s'.padStart(10)} | ${'First tok'.padStart(10)} | ${'Total tok'.padStart(10)}`);
    console.log('-'.repeat(70));
    for (const results of allResults) {
      const model = results[0]?.model || 'unknown';
      const avgTps = results.reduce((sum, r) => sum + r.tokensPerSecond, 0) / results.length;
      const avgFirstToken = results.reduce((sum, r) => sum + r.firstTokenTime, 0) / results.length;
      const totalTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);
      console.log(`${model.padEnd(25)} | ${avgTps.toFixed(1).padStart(10)} | ${(avgFirstToken).toFixed(0).padStart(8)}ms | ${String(totalTokens).padStart(10)}`);
    }
  }
}

main().catch(console.error);
