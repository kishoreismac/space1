# SPACE Platform — Deployment Automation Scripts & Templates

This document provides ready-to-use scripts, configurations, and templates for deploying the SPACE platform to Azure.

---

## Quick Reference

### One-Command Deployment (Full Automation)

```bash
#!/bin/bash
set -e

# Configure these
RESOURCE_GROUP="space-prod-rg"
LOCATION="eastus"
ENV_NAME="prod"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting SPACE Platform Deployment to Azure${NC}"

# 1. Create infrastructure
bash scripts/01-create-infrastructure.sh $RESOURCE_GROUP $LOCATION

# 2. Create database
bash scripts/02-setup-database.sh $RESOURCE_GROUP $ENV_NAME

# 3. Deploy backend
bash scripts/03-deploy-backend.sh $RESOURCE_GROUP $ENV_NAME

# 4. Deploy frontend
bash scripts/04-deploy-frontend.sh $RESOURCE_GROUP $ENV_NAME

# 5. Run data migration
bash scripts/05-migrate-data.sh $RESOURCE_GROUP $ENV_NAME

# 6. Configure monitoring
bash scripts/06-setup-monitoring.sh $RESOURCE_GROUP $ENV_NAME

echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo ""
echo "Frontend URL: https://space-$(echo $ENV_NAME | tr '[:upper:]' '[:lower:]')-app.azurestaticapps.net"
echo "Backend URL:  https://space-api-$ENV_NAME.azurewebsites.net"
echo "API Health:   https://space-api-$ENV_NAME.azurewebsites.net/api/health"
```

---

## Script 1: Infrastructure Setup

### scripts/01-create-infrastructure.sh

```bash
#!/bin/bash
set -e

RESOURCE_GROUP=${1:-"space-prod-rg"}
LOCATION=${2:-"eastus"}

echo "Creating infrastructure for $RESOURCE_GROUP..."

# Create resource group
echo "→ Creating resource group..."
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# Create Key Vault
echo "→ Creating Key Vault..."
az keyvault create \
  --resource-group $RESOURCE_GROUP \
  --name "space-kv-${RANDOM}" \
  --location $LOCATION \
  --enable-soft-delete true \
  --purge-protection false

KEYVAULT_NAME=$(az keyvault list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)

# Generate and store secrets
echo "→ Generating and storing secrets..."

JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 16)

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name JwtSecret \
  --value "$JWT_SECRET"

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name JwtRefreshSecret \
  --value "$JWT_REFRESH_SECRET"

az keyvault secret set \
  --vault-name $KEYVAULT_NAME \
  --name DatabasePassword \
  --value "$DB_PASSWORD"

# Create Storage Account
echo "→ Creating Blob Storage account..."
STORAGE_ACCOUNT="space${RANDOM}stg"

az storage account create \
  --resource-group $RESOURCE_GROUP \
  --name $STORAGE_ACCOUNT \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --https-only true \
  --min-tls-version TLS1_2

# Create storage container
STORAGE_KEY=$(az storage account keys list \
  --resource-group $RESOURCE_GROUP \
  --account-name $STORAGE_ACCOUNT \
  --query [0].value -o tsv)

az storage container create \
  --account-name $STORAGE_ACCOUNT \
  --name space-reports \
  --auth-mode key \
  --account-key "$STORAGE_KEY"

echo "✓ Infrastructure created:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Key Vault: $KEYVAULT_NAME"
echo "  Storage Account: $STORAGE_ACCOUNT"
```

---

## Script 2: Database Setup

### scripts/02-setup-database.sh

```bash
#!/bin/bash
set -e

RESOURCE_GROUP=$1
ENV_NAME=$2

echo "Setting up PostgreSQL database..."

DB_SERVER="space-db-${ENV_NAME}"
DB_NAME="space_db"
ADMIN_USER="postgres"

# Read password from Key Vault
KEYVAULT_NAME=$(az keyvault list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
DB_PASSWORD=$(az keyvault secret show --vault-name $KEYVAULT_NAME --name DatabasePassword -o tsv | cut -f3)

# Create PostgreSQL server
echo "→ Creating PostgreSQL server..."
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --location eastus \
  --admin-user $ADMIN_USER \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B2s \
  --tier Burstable \
  --storage-size 32 \
  --version 14 \
  --backup-retention 14 \
  --geo-redundant-backup Enabled \
  --high-availability Enabled \
  --public-access Enabled

# Create firewall rule for Azure services
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Create database
echo "→ Creating database..."
az postgres flexible-server execute \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --admin-user $ADMIN_USER \
  --admin-password "$DB_PASSWORD" \
  --database-name $DB_NAME

# Create application user
echo "→ Creating application user..."
az postgres flexible-server execute \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --admin-user $ADMIN_USER \
  --admin-password "$DB_PASSWORD" \
  --database-name $DB_NAME \
  --query-text "
    CREATE USER space_user WITH PASSWORD '$(echo $DB_PASSWORD | sed "s/'/''/g")';
    GRANT CONNECT ON DATABASE $DB_NAME TO space_user;
    GRANT USAGE ON SCHEMA public TO space_user;
    GRANT CREATE ON SCHEMA public TO space_user;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO space_user;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO space_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO space_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO space_user;
  "

echo "✓ Database setup complete:"
echo "  Server: $DB_SERVER.postgres.database.azure.com"
echo "  Database: $DB_NAME"
echo "  User: space_user"
```

---

## Script 3: Backend Deployment

### scripts/03-deploy-backend.sh

```bash
#!/bin/bash
set -e

RESOURCE_GROUP=$1
ENV_NAME=$2

echo "Deploying backend..."

# Retrieve secrets from Key Vault
KEYVAULT_NAME=$(az keyvault list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
STORAGE_ACCOUNT=$(az storage account list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
DB_PASSWORD=$(az keyvault secret show --vault-name $KEYVAULT_NAME --name DatabasePassword -o tsv | cut -f3)
JWT_SECRET=$(az keyvault secret show --vault-name $KEYVAULT_NAME --name JwtSecret -o tsv | cut -f3)
JWT_REFRESH_SECRET=$(az keyvault secret show --vault-name $KEYVAULT_NAME --name JwtRefreshSecret -o tsv | cut -f3)

# Create App Service Plan
echo "→ Creating App Service plan..."
PLAN_NAME="space-plan-${ENV_NAME}"
az appservice plan create \
  --resource-group $RESOURCE_GROUP \
  --name $PLAN_NAME \
  --sku B2 \
  --is-linux

# Create App Service
echo "→ Creating App Service..."
APP_NAME="space-api-${ENV_NAME}"
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $PLAN_NAME \
  --name $APP_NAME \
  --runtime "node:20-lts"

# Enable managed identity
echo "→ Enabling managed identity..."
az webapp identity assign \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --identities [system]

# Grant access to Key Vault
OBJECT_ID=$(az webapp identity show \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --query principalId -o tsv)

az keyvault set-policy \
  --vault-name $KEYVAULT_NAME \
  --object-id "$OBJECT_ID" \
  --secret-permissions get list

# Configure environment variables
echo "→ Configuring environment variables..."
DATABASE_URL="postgresql://space_user:${DB_PASSWORD}@space-db-${ENV_NAME}.postgres.database.azure.com:5432/space_db?sslmode=require"

az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings \
    NODE_ENV=production \
    PORT=4000 \
    DATABASE_URL="$DATABASE_URL" \
    JWT_SECRET="$JWT_SECRET" \
    JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    JWT_ACCESS_TTL=15m \
    JWT_REFRESH_TTL=7d \
    CORS_ORIGINS="https://space-app-${ENV_NAME}.azurestaticapps.net"

# Build and deploy backend
echo "→ Building and deploying backend..."
cd packages/backend
npm ci
npm run build

zip -r ../../app.zip dist/ node_modules/ prisma/ package*.json

cd ../../

az webapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --src-path app.zip

# Wait for deployment
echo "→ Waiting for deployment..."
sleep 30

# Test health endpoint
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://${APP_NAME}.azurewebsites.net/api/health)
if [ "$HEALTH_CHECK" -eq 200 ]; then
  echo "✓ Backend deployed successfully"
else
  echo "⚠ Backend health check returned $HEALTH_CHECK (expected 200)"
fi

echo "  App Service: https://${APP_NAME}.azurewebsites.net"
```

---

## Script 4: Database Migration

### scripts/04-migrate-data.sh

```bash
#!/bin/bash
set -e

RESOURCE_GROUP=$1
ENV_NAME=$2

echo "Running Prisma migrations..."

# Retrieve database URL
KEYVAULT_NAME=$(az keyvault list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv)
DB_PASSWORD=$(az keyvault secret show --vault-name $KEYVAULT_NAME --name DatabasePassword -o tsv | cut -f3)

export DATABASE_URL="postgresql://space_user:${DB_PASSWORD}@space-db-${ENV_NAME}.postgres.database.azure.com:5432/space_db?sslmode=require"

cd packages/backend

# Run migrations
echo "→ Running Prisma migrations..."
npx prisma migrate deploy

# Seed initial data
echo "→ Seeding initial data..."

SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="TempChangeMe!123"

export SEED_ADMIN_EMAIL=$SEED_ADMIN_EMAIL
export SEED_ADMIN_PASSWORD=$SEED_ADMIN_PASSWORD

npm run seed

echo "✓ Database migration complete"
echo "  Admin Email: $SEED_ADMIN_EMAIL"
echo "  ⚠ Change password on first login!"
```

---

## Script 5: Frontend Deployment

### scripts/05-deploy-frontend.sh

```bash
#!/bin/bash
set -e

RESOURCE_GROUP=$1
ENV_NAME=$2

echo "Deploying frontend..."

# Build frontend
echo "→ Building frontend..."
cd packages/frontend
npm ci
npm run build

# Create Static Web App
echo "→ Creating Static Web App..."
FRONTEND_NAME="space-app-${ENV_NAME}"

# Note: This requires GitHub connection
# For automation, use GitHub CLI: gh repo create ...

# OR upload to existing Static Web App
az staticwebapp create \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --location eastus \
  --sku Standard \
  --deployment-method manual

# Deploy static content
cd dist

# Get deployment token
DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "properties.apiKey" -o tsv)

# Build deployment URL
DEPLOYMENT_URL="https://${DEPLOYMENT_TOKEN}@${FRONTEND_NAME}.azurestaticapps.net/api/deploy/zip?pr=<pr_id>"

# For now, use simpler approach via zip
ZIP_FILE="../../../frontend-dist.zip"
zip -r $ZIP_FILE .

curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @$ZIP_FILE \
  "https://${DEPLOYMENT_TOKEN}@${FRONTEND_NAME}.azurestaticapps.net/api/deploy/zip?deployment=main"

echo "✓ Frontend deployed"
echo "  URL: https://${FRONTEND_NAME}.azurestaticapps.net"
```

---

## Template: .env.production

```bash
# Production Environment File
# Store in Azure Key Vault, NOT in git

# Server
NODE_ENV=production
PORT=4000
CORS_ORIGINS=https://space-app-prod.azurestaticapps.net

# Database (Retrieved from Key Vault at runtime)
DATABASE_URL=postgresql://space_user:PASSWORD@space-db-prod.postgres.database.azure.com:5432/space_db?sslmode=require

# Authentication (Retrieved from Key Vault at runtime)
JWT_SECRET=<strong-random-secret-from-keyvault>
JWT_REFRESH_SECRET=<strong-random-secret-from-keyvault>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# Initial Admin (Only used for first seed)
SEED_ADMIN_EMAIL=admin@company.com
SEED_ADMIN_PASSWORD=<temporary-strong-password>

# Optional: Azure Services
AZURE_FOUNDRY_ENDPOINT=https://...
AZURE_FOUNDRY_API_KEY=<api-key>
AZURE_FOUNDRY_DEPLOYMENT=<deployment-id>

# Optional: Storage
AZURE_STORAGE_ACCOUNT_NAME=spaceprodstg
AZURE_STORAGE_CONTAINER=space-reports

# Optional: Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid-api-key>
EMAIL_FROM_ADDRESS=noreply@space-platform.com
```

---

## Template: staticwebapp.config.json

```json
{
  "routes": [
    {
      "route": "/api/*",
      "rewrite": "https://space-api-prod.azurewebsites.net/api/*",
      "allowedRoles": []
    },
    {
      "route": "/*",
      "serve": "index.html",
      "statusCode": 200
    },
    {
      "route": "/error.html",
      "statusCode": 404
    }
  ],
  "auth": {
    "identityProviders": {}
  },
  "env": "production",
  "navigationFallback": {
    "rewrite": "index.html",
    "exclude": ["/api/*"]
  },
  "responseOverrides": {
    "400": "/error.html",
    "404": "/index.html",
    "500": "/error.html"
  },
  "globalHeaders": {
    "content-security-policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-xss-protection": "1; mode=block"
  }
}
```

---

## Template: Dockerfile (for Container Apps)

```dockerfile
# Multi-stage build for production backend

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace
COPY package*.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY tsconfig.base.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY packages/backend ./packages/backend/
COPY packages/shared ./packages/shared/

# Build
RUN npm run build --workspace @space/backend

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY packages/backend/package.json ./packages/backend/

# Install production dependencies only
ENV NODE_ENV=production
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode); })"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "packages/backend/dist/server.js"]
```

---

## Template: GitHub Actions CI/CD Pipeline

### .github/workflows/deploy-prod.yml

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AZURE_RESOURCE_GROUP: space-prod-rg
  AZURE_BACKEND_APP: space-api-prod
  AZURE_FRONTEND_APP: space-app-prod

jobs:
  test-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm run test
      
      - name: Run linter
        run: npm run lint
      
      - name: Build backend
        run: npm run build --workspace @space/backend
      
      - name: Build frontend
        run: npm run build --workspace @space/frontend
      
      - name: Upload backend artifacts
        uses: actions/upload-artifact@v3
        with:
          name: backend-build
          path: packages/backend/dist
      
      - name: Upload frontend artifacts
        uses: actions/upload-artifact@v3
        with:
          name: frontend-build
          path: packages/frontend/dist

  deploy-backend:
    needs: test-and-build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Download backend artifacts
        uses: actions/download-artifact@v3
        with:
          name: backend-build
          path: packages/backend/dist
      
      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Deploy to App Service
        run: |
          zip -r app.zip packages/backend/dist packages/backend/node_modules packages/backend/prisma package.json
          az webapp deployment source config-zip \
            --resource-group ${{ env.AZURE_RESOURCE_GROUP }} \
            --name ${{ env.AZURE_BACKEND_APP }} \
            --src-path app.zip
      
      - name: Run database migrations
        run: |
          az webapp ssh \
            --resource-group ${{ env.AZURE_RESOURCE_GROUP }} \
            --name ${{ env.AZURE_BACKEND_APP }} \
            --command "npm run db:migrate"

  deploy-frontend:
    needs: test-and-build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Download frontend artifacts
        uses: actions/download-artifact@v3
        with:
          name: frontend-build
          path: packages/frontend/dist
      
      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Deploy to Static Web App
        run: |
          az staticwebapp update \
            --resource-group ${{ env.AZURE_RESOURCE_GROUP }} \
            --name ${{ env.AZURE_FRONTEND_APP }} \
            --source packages/frontend/dist

  post-deploy-tests:
    needs: [deploy-backend, deploy-frontend]
    runs-on: ubuntu-latest
    steps:
      - name: Health check
        run: |
          curl --fail https://space-api-prod.azurewebsites.net/api/health
          curl --fail https://space-app-prod.azurestaticapps.net
      
      - name: Notify Slack
        if: success()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'SPACE Platform deployed successfully to production'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Data Migration Templates

### SQL Export Script

```bash
#!/bin/bash
# Extract data from local SQLite for PostgreSQL migration

DB_FILE="packages/backend/prisma/dev.db"
OUTPUT_FILE="local-data-export.sql"

echo "Exporting data from SQLite to SQL..."

# Export full dump
sqlite3 $DB_FILE ".dump" > $OUTPUT_FILE

# Post-process for PostgreSQL
sed -i 's/AUTOINCREMENT/SERIAL/g' $OUTPUT_FILE
sed -i 's/BEGIN TRANSACTION;//g' $OUTPUT_FILE
sed -i 's/COMMIT;//g' $OUTPUT_FILE
sed -i 's/PRAGMA foreign_keys=OFF;//g' $OUTPUT_FILE

echo "✓ Export complete: $OUTPUT_FILE"
echo "  Next: Upload to PostgreSQL via psql or import script"
```

### JSON Export Script

```typescript
// scripts/export-data.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function exportAll() {
  const data = {
    company:         await prisma.company.findMany(),
    team:            await prisma.team.findMany(),
    user:            await prisma.user.findMany(),
    questionnaire:   await prisma.questionnaire.findMany(),
    question:        await prisma.question.findMany(),
    campaign:        await prisma.surveyCampaign.findMany(),
    submission:      await prisma.submission.findMany(),
    answer:          await prisma.answer.findMany(),
    theme:           await prisma.openTextTheme.findMany(),
    journey:         await prisma.journeyMapSession.findMany(),
    blocker:         await prisma.blocker.findMany(),
  };

  fs.writeFileSync('backup-data.json', JSON.stringify(data, null, 2));
  console.log('✓ Data exported to backup-data.json');
}

exportAll().then(() => process.exit(0));
```

---

## Deployment Checklist

```markdown
# Pre-Deployment
- [ ] Azure subscription created
- [ ] Billing alerts configured
- [ ] SSH keys generated for deployments
- [ ] DNS domain registered
- [ ] SSL certificate request prepared
- [ ] Secrets manager setup (Key Vault)
- [ ] Backup strategy documented

# Infrastructure
- [ ] Resource group created
- [ ] Key Vault deployed with secrets
- [ ] PostgreSQL server created and accessible
- [ ] Storage account created with containers
- [ ] App Service plan created
- [ ] App Service instance created
- [ ] Static Web App created
- [ ] Managed identities configured

# Backend
- [ ] Build completed without errors
- [ ] Deployment package created
- [ ] Environment variables configured
- [ ] Database migrations run successfully
- [ ] Initial seed completed (admin user)
- [ ] Health check passing (200 OK)
- [ ] API endpoints responding correctly

# Frontend
- [ ] Build completed without errors
- [ ] No console errors in production build
- [ ] API proxy configured
- [ ] Custom domain configured
- [ ] SSL certificate provisioned
- [ ] Frontend loads without errors
- [ ] Login flow works end-to-end

# Data Migration
- [ ] Local data exported successfully
- [ ] Data validation script passed
- [ ] No referential integrity violations
- [ ] Record counts verified
- [ ] Sample queries executed successfully

# Monitoring & Logging
- [ ] Application Insights configured
- [ ] Dashboard created
- [ ] Alerts configured (error rate, latency, etc.)
- [ ] Log retention policies set
- [ ] Backup testing completed

# Security
- [ ] HTTPS enforced (no http://)
- [ ] CORS configured for production domain only
- [ ] JWT secrets strong and stored securely
- [ ] No secrets in code or git logs
- [ ] Database user permissions minimized
- [ ] Firewall rules applied
- [ ] DDoS protection enabled (if required)

# Testing
- [ ] Load testing completed
- [ ] Failover testing completed
- [ ] Backup restoration testing completed
- [ ] Disaster recovery drill completed
- [ ] Security audit passed

# Go-Live
- [ ] User communication sent
- [ ] Support team briefed
- [ ] Deployment window scheduled
- [ ] Rollback plan documented
- [ ] On-call team assigned
- [ ] Monitoring dashboard live
- [ ] Post-deployment validation passed

# Post-Go-Live (24-48h)
- [ ] Monitor error rates and latency
- [ ] Check database connection pool
- [ ] Review logs for unusual activity
- [ ] Verify backups completing
- [ ] User feedback collected
```

---

## Troubleshooting Common Deployment Issues

### Issue: App Service won't start

```bash
# Check logs
az webapp log tail --resource-group space-prod-rg --name space-api-prod

# Common causes:
# 1. DATABASE_URL not set or invalid
# 2. Node modules not installed
# 3. TypeScript compilation errors
# 4. Missing environment variables

# Solution:
az webapp config appsettings set \
  --resource-group space-prod-rg \
  --name space-api-prod \
  --settings NODE_ENV=production PORT=4000

az webapp restart --resource-group space-prod-rg --name space-api-prod
```

### Issue: Database connection fails

```bash
# Test connection from local machine
psql -h space-db-prod.postgres.database.azure.com \
     -U space_user \
     -d space_db \
     -c "SELECT 1;"

# If fails:
# 1. Check firewall rules allow your IP
az postgres flexible-server firewall-rule create \
  --resource-group space-prod-rg \
  --name space-db-prod \
  --rule-name AllowMyIP \
  --start-ip-address YOUR.IP.HERE \
  --end-ip-address YOUR.IP.HERE

# 2. Verify credentials in Key Vault
az keyvault secret show \
  --vault-name space-kv-xxx \
  --name DatabasePassword
```

### Issue: Frontend API calls return 403/CORS error

```javascript
// Error: Access to XMLHttpRequest at 'https://api.example.com' 
// from origin 'https://frontend.example.com' has been blocked by CORS policy

// Solution: Update CORS_ORIGINS in backend
az webapp config appsettings set \
  --resource-group space-prod-rg \
  --name space-api-prod \
  --settings CORS_ORIGINS=https://frontend.example.com

# Restart
az webapp restart --resource-group space-prod-rg --name space-api-prod
```

### Issue: Static Web App deploy fails

```bash
# Check deployment logs
az staticwebapp show \
  --resource-group space-prod-rg \
  --name space-app-prod

# Re-trigger deployment
az staticwebapp linked-backends link \
  --resource-group space-prod-rg \
  --name space-app-prod \
  --backend-resource-id /subscriptions/.../space-api-prod

# Or manual upload
az staticwebapp update \
  --resource-group space-prod-rg \
  --name space-app-prod \
  --source ./packages/frontend/dist
```

---

## Useful Commands Reference

```bash
# View deployment status
az deployment group show \
  --resource-group space-prod-rg \
  --name space-deployment

# Monitor app in real-time
az monitor metrics list \
  --resource /subscriptions/.../space-api-prod \
  --metric-names Requests,ServerErrors,ResponseTime \
  --interval PT1M \
  --start-time 2024-06-02T00:00:00Z

# Trigger manual backup
az postgres flexible-server backup create \
  --resource-group space-prod-rg \
  --name space-db-prod \
  --backup-name manual-backup-$(date +%s)

# Scale up app service (if needed)
az appservice plan update \
  --resource-group space-prod-rg \
  --name space-plan-prod \
  --sku S1

# View deployment history
az webapp deployment slot list \
  --name space-api-prod \
  --resource-group space-prod-rg

# Clear app cache
az webapp config appsettings delete \
  --resource-group space-prod-rg \
  --name space-api-prod \
  --setting-names CACHE_KEY

# Export database
pg_dump -h space-db-prod.postgres.database.azure.com \
        -U space_user \
        -d space_db \
        > backup-$(date +%Y%m%d).sql
```

---

**Last Updated:** June 2, 2026  
**Compatible With:** SPACE Platform v0.1.0+
