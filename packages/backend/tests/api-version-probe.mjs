import 'dotenv/config';

const endpoint = (process.env.AZURE_FOUNDRY_ENDPOINT ?? '').replace(/\/$/, '');
const apiKey = process.env.AZURE_FOUNDRY_API_KEY ?? '';
const deployment = process.env.AZURE_FOUNDRY_DEPLOYMENT ?? '';

const versions = [
  '2025-04-14',
  '2025-03-01-preview',
  '2025-02-01-preview',
  '2025-01-01-preview',
  '2024-12-01-preview',
  '2024-10-21',
  '2024-08-01-preview',
  '2024-06-01',
  '2024-05-01-preview',
  '2024-02-15-preview',
];

if (!endpoint || !apiKey || !deployment) {
  console.error('Missing endpoint/key/deployment in environment');
  process.exit(2);
}

async function testVersion(apiVersion) {
  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Return JSON {"ok":true} only.' },
          { role: 'user', content: 'ping' },
        ],
        temperature: 0,
        max_tokens: 20,
        response_format: { type: 'json_object' },
      }),
    });

    const text = await res.text();
    const short = text.replace(/\s+/g, ' ').slice(0, 220);
    return { apiVersion, status: res.status, ok: res.ok, body: short };
  } catch (err) {
    return { apiVersion, status: 0, ok: false, body: String(err) };
  }
}

const results = [];
for (const v of versions) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await testVersion(v));
}

for (const r of results) {
  console.log(`${r.apiVersion}\t${r.status}\t${r.ok ? 'OK' : 'FAIL'}\t${r.body}`);
}

const passing = results.filter((r) => r.ok);
if (passing.length === 0) {
  process.exit(1);
}

console.log(`BEST_WORKING_VERSION=${passing[0].apiVersion}`);
