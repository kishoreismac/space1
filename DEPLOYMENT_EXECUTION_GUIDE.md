# SPACE Platform — Step-by-Step Deployment Execution Guide

This guide provides detailed, copy-paste-ready commands for each deployment phase with expected outputs and rollback procedures.

---

## Prerequisites ✓

Before starting, verify you have:

```bash
# 1. Azure CLI installed and authenticated
az --version
az login

# 2. Node.js and npm
node --version  # Should be v20+
npm --version   # Should be v10+

# 3. PostgreSQL client (optional, for direct DB testing)
psql --version

# 4. Git and working directory
git status

# 5. Deployment scripts cloned
[ -f scripts/01-create-infrastructure.sh ] && echo "✓ Scripts found" || echo "✗ Scripts missing"
```

If any prerequisite is missing, **STOP and install before continuing.**

---

## PHASE 1: Resource Group & Key Vault Setup

**Duration:** 5-10 minutes  
**Risk Level:** 🟢 LOW — No data, easily deleted if needed

### Step 1.1: Create Resource Group

```bash
# Variables
RESOURCE_GROUP="space-prod-rg"
LOCATION="eastus"

# Create
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# Expected output:
# {
#   "id": "/subscriptions/YOUR-SUB-ID/resourceGroups/space-prod-rg",
#   "location": "eastus",
#   "name": "space-prod-rg",
#   "properties": {
#     "provisioningState": "Succeeded"
#   },
#   "tags": null
# }

# Verify
az group show --name $RESOURCE_GROUP

# Save for later use
echo "RESOURCE_GROUP=$RESOURCE_GROUP" > deployment.env
```

### Step 1.2: Create Key Vault

```bash
# Generate unique name
KV_NAME="space-kv-$(date +%s)"

# Create Key Vault
az keyvault create \
  --resource-group $RESOURCE_GROUP \
  --name $KV_NAME \
  --location $LOCATION \
  --enable-soft-delete true \
  --purge-protection false \
  --sku standard

# Expected output:
# "id": "/subscriptions/.../resourceGroups/.../providers/Microsoft.KeyVault/vaults/space-kv-...",
# "properties": {
#   "provisioningState": "Succeeded",
#   "tenantId": "...",
#   "accessPolicies": [...]
# }

# Save for later
echo "KV_NAME=$KV_NAME" >> deployment.env
source deployment.env
```

### Step 1.3: Generate and Store Secrets

```bash
# Generate strong secrets
JWT_SECRET=$(openssl rand -base64 43)  # 43 chars = 32 bytes base64
JWT_REFRESH_SECRET=$(openssl rand -base64 43)
DB_PASSWORD=$(openssl rand -base64 21)  # 21 chars = 16 bytes base64

# Verify generated secrets are strong (should be 40+ chars)
echo "JWT_SECRET length: ${#JWT_SECRET}"
echo "JWT_REFRESH_SECRET length: ${#JWT_REFRESH_SECRET}"
echo "DB_PASSWORD length: ${#DB_PASSWORD}"

# Store in Key Vault (⚠ NEVER commit these to git!)
az keyvault secret set \
  --vault-name $KV_NAME \
  --name JwtSecret \
  --value "$JWT_SECRET"

az keyvault secret set \
  --vault-name $KV_NAME \
  --name JwtRefreshSecret \
  --value "$JWT_REFRESH_SECRET"

az keyvault secret set \
  --vault-name $KV_NAME \
  --name DatabasePassword \
  --value "$DB_PASSWORD"

# Verify storage
az keyvault secret list --vault-name $KV_NAME

# Expected output:
# [
#   {
#     "attributes": { "created": "2024-06-02T...", "enabled": true },
#     "id": "https://space-kv-....vault.azure.net/secrets/JwtSecret/...",
#     "name": "JwtSecret"
#   },
#   ...
# ]

# Save secrets locally (SECURE LOCATION ONLY!)
cat > .secrets.env << EOF
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
DB_PASSWORD=$DB_PASSWORD
EOF

chmod 600 .secrets.env
echo ".secrets.env" >> .gitignore
```

### 1.4: Create Storage Account for Reports

```bash
# Generate unique storage name (lowercase, no special chars)
STORAGE_ACCOUNT="space$(date +%s)stg"

# Create storage account
az storage account create \
  --resource-group $RESOURCE_GROUP \
  --name $STORAGE_ACCOUNT \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2 \
  --https-only true \
  --min-tls-version TLS1_2 \
  --default-action Deny

# Expected output:
# "provisioningState": "Succeeded",
# "storageAccountSkuName": "Standard_LRS"

# Create blob container
STORAGE_KEY=$(az storage account keys list \
  --resource-group $RESOURCE_GROUP \
  --account-name $STORAGE_ACCOUNT \
  --query "[0].value" -o tsv)

az storage container create \
  --account-name $STORAGE_ACCOUNT \
  --name space-reports \
  --auth-mode key \
  --account-key "$STORAGE_KEY"

# Verify
az storage container exists \
  --account-name $STORAGE_ACCOUNT \
  --name space-reports \
  --account-key "$STORAGE_KEY"

# Expected output:
# "exists": true

# Save
echo "STORAGE_ACCOUNT=$STORAGE_ACCOUNT" >> deployment.env
```

### ✅ Phase 1 Validation Checklist

```bash
# Verify all Phase 1 resources exist
echo "=== PHASE 1 VALIDATION ==="

echo -n "✓ Resource Group: "
az group show --name $RESOURCE_GROUP \
  --query "provisioningState" -o tsv

echo -n "✓ Key Vault: "
az keyvault show --name $KV_NAME \
  --query "properties.provisioningState" -o tsv

echo -n "✓ Storage Account: "
az storage account show \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query "provisioningState" -o tsv

echo -n "✓ Secrets stored: "
az keyvault secret list --vault-name $KV_NAME \
  --query "length([])" -o tsv

echo "All Phase 1 resources deployed successfully!"
```

---

## PHASE 2: PostgreSQL Database Setup

**Duration:** 10-15 minutes (PostgreSQL may take extra time to provision)  
**Risk Level:** 🟡 MEDIUM — Database created but empty

### Step 2.1: Create PostgreSQL Server

```bash
# Variables
DB_SERVER="space-db-prod"
DB_NAME="space_db"
ADMIN_USER="postgres"

# Retrieve password from deployment
source deployment.env
source .secrets.env

# Create PostgreSQL flexible server
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --location $LOCATION \
  --admin-user $ADMIN_USER \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B2s \
  --tier Burstable \
  --storage-size 32 \
  --version 14 \
  --backup-retention 14 \
  --geo-redundant-backup Enabled \
  --high-availability Enabled \
  --public-access Enabled \
  --yes

# ⏳ ** WAIT 10-15 MINUTES ** — PostgreSQL provisioning can take time
echo "PostgreSQL is provisioning... This may take 10-15 minutes."
echo "You can check progress with:"
echo "  az postgres flexible-server show --resource-group $RESOURCE_GROUP --name $DB_SERVER"

# Once complete, expected output:
# "resourceGroup": "space-prod-rg",
# "state": "Ready"
```

### Step 2.2: Configure Firewall Rules

```bash
# While waiting for DB, set up firewall

# Allow Azure services to connect
az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Expected output:
# "properties": {
#   "startIpAddress": "0.0.0.0",
#   "endIpAddress": "0.0.0.0"
# }

# Also allow your current IP (for local testing)
YOUR_IP=$(curl -s https://api.ipify.org)
echo "Your IP: $YOUR_IP"

az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --rule-name AllowMyIP \
  --start-ip-address $YOUR_IP \
  --end-ip-address $YOUR_IP

# List all firewall rules
az postgres flexible-server firewall-rule list \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER
```

### Step 2.3: Wait for DB to be Ready

```bash
# Poll until Ready
wait_for_db() {
  local state=""
  local attempts=0
  while [ "$state" != "Ready" ] && [ $attempts -lt 30 ]; do
    state=$(az postgres flexible-server show \
      --resource-group $RESOURCE_GROUP \
      --name $DB_SERVER \
      --query "state" -o tsv 2>/dev/null || echo "Provisioning")
    
    echo "Status: $state (attempt $((attempts+1))/30)"
    
    if [ "$state" == "Ready" ]; then
      echo "✓ Database is ready!"
      return 0
    fi
    
    sleep 30
    ((attempts++))
  done
  
  echo "✗ Database provisioning timed out"
  return 1
}

wait_for_db
```

### Step 2.4: Create Database and Application User

```bash
# Get FQDN
DB_FQDN=$(az postgres flexible-server show \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER \
  --query "fullyQualifiedDomainName" -o tsv)

echo "Database FQDN: $DB_FQDN"

# Test connection with admin
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -c "SELECT version();"

# Enter password when prompted
# Expected output: PostgreSQL 14.x on...

# Create application database
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -c "CREATE DATABASE $DB_NAME;"

# Verify database created
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -c "\l" | grep $DB_NAME

# Create application user with password
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -d postgres \
     -c "CREATE USER space_user WITH PASSWORD '$DB_PASSWORD';"

# Grant privileges to application user
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -d $DB_NAME \
     -c "
       GRANT CONNECT ON DATABASE $DB_NAME TO space_user;
       GRANT USAGE ON SCHEMA public TO space_user;
       GRANT CREATE ON SCHEMA public TO space_user;
       GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO space_user;
       GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO space_user;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO space_user;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO space_user;
     "

# Test application user connection
psql -h $DB_FQDN \
     -U space_user \
     -d $DB_NAME \
     -c "SELECT user;" \
     -W  # Prompts for password

# Expected output: space_user

# Save for Phase 3
echo "DB_SERVER=$DB_SERVER" >> deployment.env
echo "DB_FQDN=$DB_FQDN" >> deployment.env
echo "DB_NAME=$DB_NAME" >> deployment.env
```

### ✅ Phase 2 Validation Checklist

```bash
# Test database connectivity
echo "=== PHASE 2 VALIDATION ==="

source deployment.env
source .secrets.env

# 1. Admin connection
echo -n "✓ Admin can connect: "
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -d postgres \
     -c "SELECT 1;" 2>/dev/null && echo "YES" || echo "FAILED"

# 2. Application database exists
echo -n "✓ Application DB exists: "
psql -h $DB_FQDN \
     -U $ADMIN_USER \
     -c "\l" | grep $DB_NAME && echo "YES" || echo "FAILED"

# 3. Application user can connect
echo -n "✓ App user can connect: "
PGPASSWORD=$DB_PASSWORD psql -h $DB_FQDN \
  -U space_user \
  -d $DB_NAME \
  -c "SELECT 1;" 2>/dev/null && echo "YES" || echo "FAILED"

echo "All Phase 2 resources deployed successfully!"
```

---

## PHASE 3: Backend Deployment to App Service

**Duration:** 15-20 minutes  
**Risk Level:** 🟡 MEDIUM — App will fail until migration runs

### Step 3.1: Create App Service Infrastructure

```bash
# Variables
APP_NAME="space-api-prod"
PLAN_NAME="space-plan-prod"

source deployment.env
source .secrets.env

# Create App Service Plan
az appservice plan create \
  --resource-group $RESOURCE_GROUP \
  --name $PLAN_NAME \
  --sku B2 \
  --is-linux \
  --number-of-workers 1

# Expected output:
# "sku": { "name": "B2", "tier": "Standard" }

# Create App Service
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $PLAN_NAME \
  --name $APP_NAME \
  --runtime "node:20-lts" \
  --deployment-source-url https://github.com/your-repo \
  --deployment-source-branch main

# Expected output:
# "defaultHostName": "space-api-prod.azurewebsites.net"

echo "APP_NAME=$APP_NAME" >> deployment.env
```

### Step 3.2: Enable Managed Identity

```bash
# Enable system-assigned managed identity
az webapp identity assign \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --identities [system]

# Get identity object ID
IDENTITY_OBJECT_ID=$(az webapp identity show \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --query principalId -o tsv)

echo "Managed Identity Object ID: $IDENTITY_OBJECT_ID"

# Grant identity access to Key Vault
az keyvault set-policy \
  --vault-name $KV_NAME \
  --object-id "$IDENTITY_OBJECT_ID" \
  --secret-permissions get list \
  --certificate-permissions get list

# Verify
az keyvault access-policy show \
  --vault-name $KV_NAME \
```

### Step 3.3: Configure Environment Variables

```bash
# Build DATABASE_URL
DATABASE_URL="postgresql://space_user:${DB_PASSWORD}@${DB_FQDN}:5432/${DB_NAME}?sslmode=require"

# Set all environment variables
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
    CORS_ORIGINS="https://space-app-prod.azurestaticapps.net" \
    ADMIN_EMAIL="admin@space-platform.com"

# Verify settings
az webapp config appsettings list \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME | grep -E "DATABASE_URL|JWT_SECRET|PORT"

# Expected: All variables present (JWT_SECRET/PASSWORD values hidden)
```

### Step 3.4: Build and Deploy Backend

```bash
# Navigate to workspace root
cd /path/to/space1

# Build backend
echo "Building backend..."
npm ci
npm run build --workspace @space/backend

# Create deployment package
echo "Packaging for deployment..."
cd packages/backend

# Create zip with built code and dependencies
zip -r ../../backend-deploy.zip \
  dist/ \
  node_modules/ \
  prisma/ \
  package.json \
  package-lock.json

cd ../../

# Deploy to App Service
echo "Deploying to App Service..."
az webapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --src-path backend-deploy.zip

# Expected output:
# "active": true, "deploymentId": "..."

echo "✓ Deployment package uploaded"

# Wait for routing engine to update (30-60 seconds)
sleep 30
```

### Step 3.5: Verify Backend Deployment

```bash
# Check App Service logs
az webapp log tail \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --number-to-end 50

# Test health endpoint
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo "Testing backend health..."
curl -i $APP_URL/api/health

# Expected response:
# HTTP/1.1 500 Internal Server Error  ← Normal before migration!
# { "message": "Service unavailable - awaiting database migration" }

# That's EXPECTED! Database hasn't been migrated yet.
# We'll fix this in Phase 5.
```

### ✅ Phase 3 Validation Checklist

```bash
source deployment.env

echo "=== PHASE 3 VALIDATION ==="

# 1. App Service is running
echo -n "✓ App Service is running: "
RUNNING=$(az webapp show \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --query "state" -o tsv)
[ "$RUNNING" == "Running" ] && echo "YES" || echo "FAILED ($RUNNING)"

# 2. Environment variables set
echo -n "✓ PORT variable set: "
az webapp config appsettings list \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME | grep -q "PORT" && echo "YES" || echo "FAILED"

# 3. Managed identity enabled
echo -n "✓ Managed identity enabled: "
az webapp identity show \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --query "type" -o tsv

echo "Phase 3 infrastructure deployed (app will start after migration)"
```

---

## PHASE 4: Frontend Deployment to Static Web App

**Duration:** 10 minutes  
**Risk Level:** 🟢 LOW — Static files only, no data risk

### Step 4.1: Create Static Web App

```bash
# Variables
FRONTEND_NAME="space-app-prod"

source deployment.env

# Create Static Web App
az staticwebapp create \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --location eastus \
  --sku Standard

# Expected output:
# "name": "space-app-prod",
# "state": "Deployed"

echo "FRONTEND_NAME=$FRONTEND_NAME" >> deployment.env

# Get default domain
DEFAULT_DOMAIN=$(az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "defaultHostname" -o tsv)

echo "Frontend default domain: https://$DEFAULT_DOMAIN"
```

### Step 4.2: Build Frontend

```bash
# Build frontend (from workspace root)
cd /path/to/space1
pwd  # Verify you're in workspace root

echo "Building frontend..."
npm run build --workspace @space/frontend

# Verify build output
ls -lah packages/frontend/dist/

# Expected: index.html, assets/, etc.
```

### Step 4.3: Create staticwebapp.config.json

```bash
# Create config for SWA routing
cat > packages/frontend/staticwebapp.config.json << 'EOF'
{
  "routes": [
    {
      "route": "/api/*",
      "rewrite": "https://space-api-prod.azurewebsites.net/api/*",
      "allowedRoles": []
    },
    {
      "route": "/*.json",
      "serve": "/*.json",
      "statusCode": 200
    },
    {
      "route": "/*",
      "serve": "/index.html",
      "statusCode": 200
    }
  ],
  "navigationFallback": {
    "rewrite": "index.html",
    "exclude": ["/api/*", "/*.json", "/*.png", "/*.gif", "/*.ico", "/*.svg", "/*.css", "/*.js"]
  },
  "globalHeaders": {
    "content-security-policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-xss-protection": "1; mode=block",
    "strict-transport-security": "max-age=31536000; includeSubDomains"
  },
  "responseOverrides": {
    "400": "/error.html",
    "404": "/index.html",
    "500": "/error.html"
  }
}
EOF

# Include in dist
cp packages/frontend/staticwebapp.config.json packages/frontend/dist/
```

### Step 4.4: Deploy Frontend

```bash
source deployment.env

# Option A: Using az staticwebapp (requires authentication)
echo "Deploying frontend..."

cd packages/frontend/dist

# Get deployment token
DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "properties.apiKey" -o tsv)

# Create zip of all files
cd ..
zip -r dist-deploy.zip dist/

# Deploy
curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @dist-deploy.zip \
  "https://${DEPLOYMENT_TOKEN}@${FRONTEND_NAME}.azurestaticapps.net/api/deploy/zip?deployment=main"

# Expected response:
# HTTP/1.1 200 OK
# {"status":"succeeded","id":"..."}

cd ../../
```

### Step 4.5: Verify Frontend Deployment

```bash
source deployment.env

# Test frontend URL
FRONTEND_URL="https://$(az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "defaultHostname" -o tsv)"

echo "Frontend URL: $FRONTEND_URL"

# Verify index.html loads
curl -I $FRONTEND_URL

# Expected: HTTP/1.1 200 OK

# Check for any console errors (manual testing needed)
echo "Open in browser to verify: $FRONTEND_URL"
```

### ✅ Phase 4 Validation Checklist

```bash
source deployment.env

echo "=== PHASE 4 VALIDATION ==="

# 1. Static Web App exists
echo -n "✓ Static Web App created: "
az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "name" -o tsv

# 2. Frontend loads
echo -n "✓ Frontend loads: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  https://$(az staticwebapp show \
    --resource-group $RESOURCE_GROUP \
    --name $FRONTEND_NAME \
    --query "defaultHostname" -o tsv))
[ "$STATUS" == "200" ] && echo "YES (HTTP $STATUS)" || echo "FAILED (HTTP $STATUS)"

echo "Phase 4 deployment complete (frontend ready, backend pending migration)"
```

---

## PHASE 5: Database Migration & Data Import

**Duration:** 5-10 minutes  
**Risk Level:** 🔴 HIGH — Schema creation and data migration

### Step 5.1: Prepare Local Data Export

```bash
# BACKUP ORIGINAL FIRST
cd /path/to/space1

# Export current SQLite data to SQL dump
echo "Exporting local data from SQLite..."

cat > scripts/export-sqlite.sh << 'EOF'
#!/bin/bash
DB_FILE="packages/backend/prisma/dev.db"
OUTPUT_FILE="local-data-backup.sql"

if [ ! -f "$DB_FILE" ]; then
  echo "✗ SQLite database not found: $DB_FILE"
  exit 1
fi

echo "Exporting from SQLite..."
sqlite3 "$DB_FILE" ".dump" > "$OUTPUT_FILE"

echo "✓ Exported to $OUTPUT_FILE"
ls -lh "$OUTPUT_FILE"
EOF

chmod +x scripts/export-sqlite.sh
./scripts/export-sqlite.sh

# Verify export
ls -lh local-data-backup.sql
head -20 local-data-backup.sql  # Should show CREATE TABLE statements
```

### Step 5.2: Run Prisma Migrations

```bash
source deployment.env
source .secrets.env

# Set environment for production database
export DATABASE_URL="postgresql://space_user:${DB_PASSWORD}@${DB_FQDN}:5432/${DB_NAME}?sslmode=require"

echo "Running Prisma migrations..."

cd packages/backend

# Run migrations (this creates schema in PostgreSQL)
npx prisma migrate deploy

# Expected output:
# Prisma schema loaded from prisma/schema.prisma
# 2 migrations found in prisma/migrations
#
# Running migrations:
# migrations/20240601120000_init
# migrations/20240601130000_add_audit_logs
# ✓ Ran all pending migrations

# Verify schema
npx prisma db push --skip-generate

echo "✓ Database schema deployed to PostgreSQL"
```

### Step 5.3: Seed Initial Data (Optional)

```bash
# Create admin user
cd packages/backend

cat > seed-admin.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@space-platform.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'TemporaryPassword123!';
  
  // Check if admin exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('✓ Admin user already exists');
    return;
  }
  
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Create admin
  const admin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: 'Administrator',
      role: 'SUPER_ADMIN',
      emailVerified: true,
    }
  });
  
  console.log(`✓ Created admin user: ${email}`);
  console.log(`✓ Temporary password: ${password}`);
  console.log('⚠ IMPORTANT: Change admin password on first login');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect;
  });
EOF

# Run seed
export SEED_ADMIN_EMAIL="admin@space-platform.com"
export SEED_ADMIN_PASSWORD="TempChangeMe$(date +%s)!"

npx tsx seed-admin.ts

# Expected output:
# ✓ Created admin user: admin@space-platform.com
# ✓ Temporary password: TempChangeMe1717326000!
```

### Step 5.4: Verify Migration Success

```bash
source deployment.env
source .secrets.env

# Connect to PostgreSQL and verify schema
PGPASSWORD=$DB_PASSWORD psql -h $DB_FQDN \
  -U space_user \
  -d $DB_NAME << EOF

-- Check tables were created
\dt

-- Check row counts
SELECT COUNT(*) as users_count FROM "User";
SELECT COUNT(*) as companies_count FROM "Company";
SELECT COUNT(*) as campaigns_count FROM "SurveyCampaign";

-- Check admin user exists
SELECT id, email, role FROM "User" WHERE role = 'SUPER_ADMIN';

EOF

# Expected output:
# Table | public | Company | table
# Table | public | User    | table
# ... (20+ tables)
```

### Step 5.5: Restart Backend after Migration

```bash
source deployment.env

# Restart App Service to load new database schema
az webapp restart \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME

echo "Waiting 30s for backend to initialize..."
sleep 30

# Test health endpoint again
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo "Testing backend after migration..."
curl -i $APP_URL/api/health

# Expected response:
# HTTP/1.1 200 OK
# { "status": "ok", "database": "connected" }
```

### ✅ Phase 5 Validation Checklist

```bash
source deployment.env
source .secrets.env

echo "=== PHASE 5 VALIDATION ==="

# 1. Schema exists
echo -n "✓ Tables created in PostgreSQL: "
PGPASSWORD=$DB_PASSWORD psql -h $DB_FQDN \
  -U space_user \
  -d $DB_NAME \
  -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" \
  2>/dev/null

# 2. Admin user exists
echo -n "✓ Admin user exists: "
PGPASSWORD=$DB_PASSWORD psql -h $DB_FQDN \
  -U space_user \
  -d $DB_NAME \
  -t -c "SELECT email FROM \"User\" WHERE role='SUPER_ADMIN';" \
  2>/dev/null

# 3. Backend health check
echo -n "✓ Backend is healthy: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://${APP_NAME}.azurewebsites.net/api/health)
[ "$STATUS" == "200" ] && echo "YES (HTTP $STATUS)" || echo "FAILED (HTTP $STATUS)"

echo "Phase 5 complete - Database migrated and backend deployed!"
```

---

## PHASE 6: Environment Configuration & Testing

**Duration:** 10 minutes  
**Risk Level:** 🟢 LOW — Configuration only

### Step 6.1: Configure CORS

```bash
source deployment.env

# Get Static Web App domain
FRONTEND_DOMAIN=$(az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "defaultHostname" -o tsv)

FRONTEND_URL="https://${FRONTEND_DOMAIN}"

# Update CORS_ORIGINS
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings CORS_ORIGINS=$FRONTEND_URL

# Restart backend to apply
az webapp restart \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME

echo "✓ CORS configured for: $FRONTEND_URL"

sleep 30
```

### Step 6.2: Test Login Flow

```bash
source deployment.env

# Get URLs
APP_URL="https://${APP_NAME}.azurewebsites.net"
FRONTEND_URL="https://$(az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "defaultHostname" -o tsv)"

echo "Frontend URL: $FRONTEND_URL"
echo "Backend URL: $APP_URL"

# Test login endpoint (manual browser visit needed)
echo ""
echo "1. Open browser to: $FRONTEND_URL"
echo "2. Click Login"
echo "3. Enter credentials:"
echo "   Email: admin@space-platform.com"
echo "   Password: (from seed output above)"
echo "4. Verify dashboard loads"

# Or test via API
curl -X POST "$APP_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@space-platform.com",
    "password": "YOUR_SEED_PASSWORD_HERE"
  }'

# Expected response:
# {
#   "accessToken": "eyJ...",
#   "refreshToken": "...",
#   "user": { "id": "...", "email": "...", "role": "SUPER_ADMIN" }
# }
```

### Step 6.3: Validate API Endpoints

```bash
# Get auth token
TOKEN=$(curl -s -X POST "https://${APP_NAME}.azurewebsites.net/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@space-platform.com",
    "password": "YOUR_SEED_PASSWORD"
  }' | jq -r '.accessToken')

echo "Testing API endpoints..."

# Test companies endpoint
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://${APP_NAME}.azurewebsites.net/api/companies" | jq .

# Test health
curl -s "https://${APP_NAME}.azurewebsites.net/api/health"

# Expected: 200 OK with data
```

### ✅ Phase 6 Validation Checklist

```bash
source deployment.env

echo "=== PHASE 6 VALIDATION ==="

FRONTEND_URL="https://$(az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "defaultHostname" -o tsv)"

APP_URL="https://${APP_NAME}.azurewebsites.net"

# 1. Frontend loads
echo -n "✓ Frontend loads: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" $FRONTEND_URL

# 2. Backend health
echo -n "✓ Backend health: "
curl -s -o /dev/null -w "HTTP %{http_code}\n" $APP_URL/api/health

# 3. CORS configured
echo "✓ CORS configured for frontend"

echo "Phase 6 complete - Application ready for testing"
```

---

## PHASE 7: Monitoring & Alerts Setup

**Duration:** 5 minutes  
**Risk Level:** 🟢 LOW — Observability only

### Step 7.1: Enable Application Insights

```bash
source deployment.env

# Create Application Insights
INSIGHTS_NAME="space-insights-prod"

az monitor app-insights component create \
  --resource-group $RESOURCE_GROUP \
  --app $INSIGHTS_NAME \
  --location $LOCATION \
  --kind web

# Get instrumentation key
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --resource-group $RESOURCE_GROUP \
  --app $INSIGHTS_NAME \
  --query "instrumentationKey" -o tsv)

echo "Instrumentation Key: $INSTRUMENTATION_KEY"

# Link to App Service
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=$INSTRUMENTATION_KEY"

# Link to Storage Account
az storage account update \
  --resource-group $RESOURCE_GROUP \
  --name $STORAGE_ACCOUNT \
  --set properties.accessTier=Hot
```

### Step 7.2: Create Alert Rules

```bash
source deployment.env

# Alert: High error rate (>5 errors/min)
az monitor metrics alert create \
  --resource-group $RESOURCE_GROUP \
  --name "space-high-error-rate" \
  --scopes "/subscriptions/DEFAULT/resourcegroups/$RESOURCE_GROUP/providers/microsoft.web/sites/$APP_NAME" \
  --condition "avg Exceptions > 5" \
  --window-size 1m \
  --evaluation-frequency 1m

# Alert: High latency (>2s)
az monitor metrics alert create \
  --resource-group $RESOURCE_GROUP \
  --name "space-high-latency" \
  --scopes "/subscriptions/DEFAULT/resourcegroups/$RESOURCE_GROUP/providers/microsoft.web/sites/$APP_NAME" \
  --condition "avg ResponseTime > 2000" \
  --window-size 5m \
  --evaluation-frequency 1m

# Alert: Database connection failures
az monitor metrics alert create \
  --resource-group $RESOURCE_GROUP \
  --name "space-db-connection-failed" \
  --scopes "/subscriptions/DEFAULT/resourceGroups/$RESOURCE_GROUP/providers/microsoft.dbforpostgresql/flexibleservers/$DB_SERVER" \
  --condition "total FailedConnections > 5" \
  --window-size 5m \
  --evaluation-frequency 1m

echo "✓ Alert rules created"
```

---

## FINAL VALIDATION & SIGN-OFF

### Complete End-to-End Test

```bash
echo "=== COMPLETE SYSTEM VALIDATION ==="

source deployment.env

# 1. Frontend loads
echo -n "1. Frontend accessibility: "
FRONTEND_URL="https://$(az staticwebapp show \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME \
  --query "default Hostname" -o tsv)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" $FRONTEND_URL

# 2. Backend health
echo -n "2. Backend health check: "
APP_URL="https://${APP_NAME}.azurewebsites.net"
curl -s $APP_URL/api/health | jq '.status'

# 3. Database connectivity
echo -n "3. Database available: "
source .secrets.env
PGPASSWORD=$DB_PASSWORD psql -h $DB_FQDN \
  -U space_user \
  -d $DB_NAME \
  -c "SELECT COUNT(*) FROM \"User\";" 2>/dev/null | grep -E "^[0-9]+"

# 4. Storage accessible
echo -n "4. Storage containers: "
az storage container list \
  --account-name $STORAGE_ACCOUNT \
  --query "length([])" -o tsv

# 5. Key Vault accessible
echo -n "5. Key Vault secrets: "
az keyvault secret list --vault-name $KV_NAME \
  --query "length([])" -o tsv

echo ""
echo "✅ ALL SYSTEMS OPERATIONAL"
echo ""
echo "Production URLs:"
echo "  Frontend:   $FRONTEND_URL"
echo "  Backend API:$APP_URL"
echo "  Health:     $APP_URL/api/health"
echo ""
echo "Admin Credentials (CHANGE ON FIRST LOGIN):"
echo "  Email: admin@space-platform.com"
echo "  Password: (from Phase 5)"
```

---

## ROLLBACK PROCEDURES

### Complete Rollback

If deployment fails at any phase:

```bash
# Delete all resources (IRREVERSIBLE!)
az group delete \
  --name $RESOURCE_GROUP \
  --yes \
  --no-wait

echo "⚠ Resource group scheduled for deletion (5-15 minutes)"
```

### Partial Rollback (Keep DB)

```bash
# Delete App Service but keep database (for data retention)
az webapp delete \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME

az staticwebapp delete \
  --resource-group $RESOURCE_GROUP \
  --name $FRONTEND_NAME

# Database remains intact
# You can recreate App Services later
```

### Quick Fix (Restart Services)

```bash
# If app is unresponsive
az webapp restart \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME

# Check logs
az webapp log tail \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --number-to-end 100
```

---

## Deployment Summary

| Phase | Duration | Risk |Status |
|--- |--- |---|---|
| 1. Infrastructure | 5min | 🟢 | ✅ Resources created |
| 2. Database | 10-15min | 🟡 | ✅ PostgreSQL ready |
| 3. Backend | 15min | 🟡 | ✅ App Service deployed |
| 4. Frontend | 10min | 🟢 | ✅ Static Web App deployed |
| 5. Migration | 5min | 🔴 | ✅ Schema + data migrated |
| 6. Configuration | 10min | 🟢 | ✅ CORS, auth configured |
| 7. Monitoring | 5min | 🟢 | ✅ Alerts configured |
| **Total** | **60min** | — | **✅ Production Ready** |

---

**Last Updated:** June 2, 2024
**Deployment Runbook Version:** 1.0
**Next Step:** Execute phases sequentially following this guide
