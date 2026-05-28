import 'dotenv/config';

const endpoint = (process.env.AZURE_FOUNDRY_ENDPOINT ?? '').replace(/\/$/, '');
const apiKey = process.env.AZURE_FOUNDRY_API_KEY ?? '';
const deployment = process.env.AZURE_FOUNDRY_DEPLOYMENT ?? '';

const versions = ['v1', '2025-01-01-preview', '2024-12-01-preview', '2024-10-01-preview', '2024-05-01-preview'];
const paths = [
  '/chat/completions',
  '/models/chat/completions',
  '/openai/v1/chat/completions',
  '/openai/chat/completions',
];

async function call(path, version) {
  const withVersion = version ? `?api-version=${encodeURIComponent(version)}` : '';
  const url = `${endpoint}${path}${withVersion}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model: deployment,
        messages: [
          { role: 'system', content: 'Return {"ok":true} JSON.' },
          { role: 'user', content: 'ping' },
        ],
        max_tokens: 20,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    const text = await res.text();
    console.log(`${path}\t${version}\t${res.status}\t${res.ok ? 'OK' : 'FAIL'}\t${text.replace(/\s+/g, ' ').slice(0, 200)}`);
  } catch (e) {
    console.log(`${path}\t${version}\tERR\tFAIL\t${String(e).slice(0, 200)}`);
  }
}

for (const path of paths) {
  for (const v of versions) {
    // eslint-disable-next-line no-await-in-loop
    await call(path, v);
  }
  // eslint-disable-next-line no-await-in-loop
  await call(path, '');
}
