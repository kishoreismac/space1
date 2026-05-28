import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`⚠ ${key} not set — using insecure default`);
  }
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-insecure-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-insecure-refresh',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  foundry: {
    endpoint: process.env.AZURE_FOUNDRY_ENDPOINT ?? '',
    apiKey: process.env.AZURE_FOUNDRY_API_KEY ?? '',
    deployment: process.env.AZURE_FOUNDRY_DEPLOYMENT ?? '',
    apiVersion: process.env.AZURE_FOUNDRY_API_VERSION ?? '2024-10-21',
  },
};
