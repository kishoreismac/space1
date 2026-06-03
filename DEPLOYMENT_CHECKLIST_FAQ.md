# SPACE Platform — Pre-Deployment Checklist & FAQ

Comprehensive checklist and troubleshooting guide before beginning deployment.

---

## Pre-Deployment Readiness Checklist

### ✅ Team & Permissions

- [ ] **Azure Subscription Owner** or **Contributor** role assigned to deployment user
- [ ] **Multiple administrators** identified (for 24/7 support during deployment)
- [ ] **Change control** approved (if your org requires)
- [ ] **Stakeholders notified** of deployment window
- [ ] **Support team briefed** on new URLs and access procedures

**Command to verify permissions:**
```bash
az role assignment list --include-inherited-assignments
```

---

### ✅ Local Development Environment

- [ ] **Node.js v20+** installed
  ```bash
  node --version  # Should be v20.x or higher
  ```

- [ ] **npm v10+** installed
  ```bash
  npm --version
  ```

- [ ] **Azure CLI v2.60+** installed and authenticated
  ```bash
  az --version
  az login  # Should show your subscription
  ```

- [ ] **PostgreSQL client (`psql`)** installed (optional but recommended)
  ```bash
  psql --version
  ```

- [ ] **Git** with clean working directory
  ```bash
  git status  # Should show "nothing to commit"
  ```

- [ ] **OpenSSL** for secret generation
  ```bash
  openssl version
  ```

- [ ] **SQLite** database exists at `packages/backend/prisma/dev.db`
  ```bash
  ls -lh packages/backend/prisma/dev.db
  ```

---

### ✅ Source Code & Dependencies

- [ ] **All code changes committed** to git
  ```bash
  git status
  ```

- [ ] **Dependencies installed locally**
  ```bash
  npm ci
  npm list | head -20  # Check for any issues
  ```

- [ ] **Backend builds successfully**
  ```bash
  npm run build --workspace @space/backend
  # Should complete without errors
  ```

- [ ] **Frontend builds successfully**
  ```bash
  npm run build --workspace @space/frontend
  # Should complete without errors, dist/ folder created
  ```

- [ ] **Tests pass** (optional but recommended)
  ```bash
  npm test
  ```

- [ ] **No TypeScript errors**
  ```bash
  npm run type-check
  ```

- [ ] **.env files reviewed** (check for hardcoded secrets)
  ```bash
  grep -i "password\|secret\|key" .env
  # Should return NOTHING (use Key Vault instead)
  ```

---

### ✅ Azure Account Readiness

- [ ] **Azure subscription active** and in good standing (not suspended)
- [ ] **Billing alerts configured** (optional but recommended)
  ```bash
  az billing account list  # Verify account exists
  ```

- [ ] **Default location set** to desired region
  ```bash
  az configure --defaults location=eastus
  ```

- [ ] **Resource group naming convention decided**
  - Recommended: `space-prod-rg` or `space-staging-rg`
  - Must be unique within subscription

- [ ] **Storage account naming convention decided**
  - Must be globally unique (3-24 lowercase alphanumeric chars)
  - Recommended: `space{timestamp}stg`

- [ ] **App Service Plan SKU decided**
  - Dev: `B1` ($14/month)
  - Staging: `B2` ($30/month)
  - Production: `S1` ($65/month) or `P1` ($149/month)

- [ ] **PostgreSQL server sizing decided**
  - Dev: `Standard_B1s` (1 vCore, $76/month)
  - Production: `Standard_B2s` (2 vCore, $152/month)

---

### ✅ Security & Compliance

- [ ] **Secrets management strategy documented**
  - Using Azure Key Vault? ✓
  - Never commit secrets to git ✓

- [ ] **CORS domain finalized**
  - Frontend Static Web App domain decided
  - No overly permissive origins (e.g., `*`)

- [ ] **SSL/TLS requirements confirmed**
  - HTTPS-only? ✓ (Recommended: YES)

- [ ] **Admin email address confirmed**
  - Will receive initial credentials
  - Should be monitored email account

- [ ] **Disaster recovery procedures documented**
  - Backup frequency?
  - Restore procedure tested?
  - RTO/RPO targets defined?

- [ ] **Data retention policy confirmed**
  - How long to keep backups?
  - GDPR/compliance requirements?

---

### ✅ Communication & Documentation

- [ ] **Deployment runbook printed/saved**
  - DEPLOYMENT_EXECUTION_GUIDE.md bookmarked
  - Terminal ready for copy-paste commands

- [ ] **Deployment team communication channel open**
  - Slack, Teams, or on-call rotation active

- [ ] **Escalation contacts documented**
  - Who to contact if deployment fails?
  - After-hours support available?

- [ ] **Rollback procedure understood**
  - Can you delete resource group if needed?
  - Any data loss implications?

- [ ] **Post-deployment tasks documented**
  - Change admin password on first login
  - Configure email service (Phase 7)
  - Enable advanced monitoring (Phase 8)

---

## Pre-Deployment Checklists by Role

### ✅ DevOps / Cloud Engineer

- [ ] Subscription access verified
- [ ] Terraform/Bicep scripts reviewed
- [ ] Secrets secured in Key Vault
- [ ] CORS configuration prepared
- [ ] Database migration testing completed
- [ ] Backup/restore procedures documented
- [ ] Monitoring dashboards configured
- [ ] On-call rotation assigned

**Estimated time:** 30 mins

### ✅ Backend Developer

- [ ] Backend code builds without errors
- [ ] Environment variables documented
- [ ] Database migrations are backwards-compatible
- [ ] API health endpoint verified locally
- [ ] Common API errors handled gracefully
- [ ] Logging configured for production
- [ ] Database connection pooling tuned

**Estimated time:** 20 mins

### ✅ Frontend Developer

- [ ] Frontend code builds without errors
- [ ] API proxy configured for production backend
- [ ] Error boundaries in place (graceful failures)
- [ ] Console has no warnings or errors
- [ ] Login flow verified locally
- [ ] Environment variables for API URL correct
- [ ] Service worker caching strategy documented

**Estimated time:** 15 mins

### ✅ QA / Testing

- [ ] Test cases prepared for post-deployment
- [ ] Login/authentication test written
- [ ] API endpoint test written
- [ ] Database connectivity test written
- [ ] Performance baseline established
- [ ] Browser compatibility verified (Chrome, FF, Safari, Edge)

**Estimated time:** 30 mins

### ✅ Product / Project Manager

- [ ] Stakeholders notified of deployment
- [ ] Feature parity verified (prod vs. dev)
- [ ] User communication drafted (post-go-live)
- [ ] Success criteria documented
- [ ] Rollback decision criteria assigned
- [ ] 24-hour post-launch monitoring plan

**Estimated time:** 30 mins

---

## Frequently Asked Questions (FAQ)

### Q: How long does deployment take?

**A:** Approximately 60 minutes end-to-end:
- Phase 1 (Infrastructure): 5 min
- Phase 2 (PostgreSQL): 10-15 min ← **Longest phase**
- Phase 3 (Backend): 15 min
- Phase 4 (Frontend): 10 min
- Phase 5 (Migration): 5 min
- Phase 6 (Config): 10 min
- Phase 7 (Monitoring): 5 min

**Most of the wait is PostgreSQL provisioning (Phase 2).**

---

### Q: What if PostgreSQL creation fails?

**A:** Possible causes and solutions:

1. **Subscription doesn't support that region**
   - Try: `az postgres flexible-server list-skus --location eastus`
   - Use different region if needed

2. **Name already taken**
   - PostgreSQL names must be globally unique
   - Try: `space-db-prod-$(date +%s)`

3. **Billing issued with subscription**
   - Contact Azure Support
   - Verify subscription payment method

4. **Too many connections**
   - Subscription limit reached
   - Use simpler naming: `spacedb1`

**Command to debug:**
```bash
az postgres flexible-server create ... --verbose
```

---

### Q: Can I change the admin password later?

**A:** Yes! Two ways:

1. **Via Azure Portal:**
   - Navigate to PostgreSQL server
   - Click "Reset password"

2. **Via CLI:**
   ```bash
   az postgres flexible-server server parameter set \
     --resource-group space-prod-rg \
     --server-name space-db-prod \
     --name password \
     --value "new_password"
   ```

**Strongly recommended:** Change admin password (postgres user) to something unique.

---

### Q: What if I accidentally deleted the resource group?

**A:** The resource group and all resources are permanently deleted after 15 minutes. **No recovery possible.**

**Prevention:**
```bash
# Add delete lock to resource group
az lock create \
  --name NoDelete \
  --resource-group space-prod-rg \
  --lock-type CanNotDelete
```

---

### Q: Can I deploy to a different Azure region?

**A:** Yes! Change location in Phase 1:

```bash
# Instead of eastus, use:
LOCATION="westus2"  # or northeurope, southeastasia, etc.

# Check available locations
az account list-locations -o table
```

**Latency considerations:**
- **US East (eastus):** Good for US-based users
- **West US (westus2):** Good for US West Coast
- **North Europe (northeurope):** Good for EU users
- **Southeast Asia (southeastasia):** Good for Asia-Pacific

---

### Q: How much will this cost?

**A:** Estimated monthly costs:

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| App Service | B2 | $30 |
| PostgreSQL | B2s (2 vCore) | $152 |
| Static Web App | Standard | $0 (first 3) |
| Key Vault | Standard | ~$5 |
| Storage Account | LRS | ~$5 |
| **Total** | — | **~$192/month** |

**Notes:**
- First 1GB app service compute is free (B1 tier)
- Data transfer out: $0.12/GB
- Database backup: included in price
- Recommended for production: $400-500/month with HA

**Calculator:** https://azure.microsoft.com/pricing/calculator/

---

### Q: Can I skip any deployment phases?

**A:** **NO.** All phases are mandatory and sequential:

- ❌ Can't skip Phase 1 (infrastructure)
- ❌ Can't skip Phase 2 (database must exist)
- ❌ Can't skip Phase 3 (backend)
- ❌ Can't skip Phase 4 (frontend)
- ❌ Can't skip Phase 5 (migration) — will lose local data otherwise
- ⚠️ Phase 6 is configuration (can be done after, but recommended before testing)
- ⚠️ Phase 7 monitoring can be configured later

---

### Q: Will existing data be lost?

**A:** **No, if you follow Phase 5 correctly.**

Phase 5 explicitly:
1. Exports local SQLite data
2. Creates PostgreSQL schema
3. Runs Prisma migrations
4. Optionally seeds admin user

**Failure modes that cause data loss:**
- ❌ Skipping Phase 5
- ❌ Deleting database before export
- ❌ Running migrations twice
- ❌ Not backing up `.env` or database

**Prevention:**
```bash
# Before Phase 3, backup your local database
cp packages/backend/prisma/dev.db packages/backend/prisma/dev.db.backup
```

---

### Q: What if the backend fails to start?

**A:** Common causes:

1. **DATABASE_URL not set**
   ```bash
   az webapp config appsettings show \
     --resource-group space-prod-rg \
     --name space-api-prod | grep DATABASE_URL
   ```

2. **Database not migrated**
   ```bash
   # Phase 5 might not have completed
   az webapp log tail --resource-group space-prod-rg --name space-api-prod
   ```

3. **JWT secrets not set**
   ```bash
   az webapp config appsettings show ... | grep JWT
   ```

4. **Node modules not installed**
   ```bash
   # Delete zip and redeploy:
   rm backend-deploy.zip
   cd packages/backend && npm ci && cd ../..
   ```

**Troubleshooting:**
```bash
# Check logs
az webapp log tail --resource-group space-prod-rg --name space-api-prod --number-to-end 100

# Restart
az webapp restart --resource-group space-prod-rg --name space-api-prod

# Re-upload code
az webapp deployment source config-zip \
  --resource-group space-prod-rg \
  --name space-api-prod \
  --src-path backend-deploy.zip
```

---

### Q: Can I test deployment in staging first?

**A:** **Yes, highly recommended!**

Run through all 7 phases twice:
1. **Staging** (space-staging-rg) — break things here
2. **Production** (space-prod-rg) — now you know what works

**Staging resource group:**
```bash
RESOURCE_GROUP="space-staging-rg"
# Run phases 1-7 with staging names
```

**Cost:** Double the infrastructure cost during testing (~$384/month)

---

### Q: How do I monitor the deployment after go-live?

**A:** Three layers:

1. **Application Insights (Phase 7)**
   ```bash
   az monitor app-insights component show \
     --resource-group space-prod-rg \
     --app space-insights-prod
   ```

2. **Azure Monitor Alerts**
   - High error rate
   - High latency
   - Database connection failures

3. **Manual health checks**
   ```bash
   # Every 15 mins in first 24 hours
   curl https://space-api-prod.azurewebsites.net/api/health
   ```

**Recommended:** Set phone notifications for critical alerts.

---

### Q: What if the Static Web App deploy fails?

**A:** Possible causes:

1. **Old build files in dist/**
   ```bash
   rm -rf packages/frontend/dist
   npm run build --workspace @space/frontend
   ```

2. **Missing staticwebapp.config.json**
   ```bash
   # Create it (see DEPLOYMENT_SCRIPTS.md)
   cp packages/frontend/staticwebapp.config.json dist/
   ```

3. **Zip file too large**
   ```bash
   # Remove node_modules from frontend zip
   du -sh packages/frontend/dist/
   ```

4. **API proxy misconfigured**
   ```bash
   # Verify API rewrite in staticwebapp.config.json
   cat packages/frontend/staticwebapp.config.json | grep rewrite
   ```

---

### Q: Can I use my own domain name?

**A:** Yes! After Phase 7:

```bash
# For backend (App Service)
az webapp config hostname-binding create \
  --resource-group space-prod-rg \
  --webapp-name space-api-prod \
  --hostname api.space-platform.com

# For frontend (Static Web App)
az staticwebapp custom-domain create \
  --resource-group space-prod-rg \
  --name space-app-prod \
  --domain-name app.space-platform.com

# Then create DNS CNAME records pointing to Azure
```

**Cost:** Custom domain SSL certificates are typically $0-10/year (managed by Azure).

---

### Q: Can I scale up later if needed?

**A:** Yes! Three ways to scale:

1. **Up (larger machine)**
   ```bash
   az appservice plan update \
     --resource-group space-prod-rg \
     --name space-plan-prod \
     --sku S1  # From B2 to S1
   ```

2. **Out (more instances)**
   ```bash
   az appservice plan update \
     --resource-group space-prod-rg \
     --name space-plan-prod \
     --number-of-workers 3  # Scale from 1 to 3 instances
   ```

3. **Database scale**
   ```bash
   az postgres flexible-server update \
     --resource-group space-prod-rg \
     --name space-db-prod \
     --sku-name Standard_B4s  # Upgrade vCores
   ```

**Cost Impact:** Scaling up can increase monthly costs by $50-500 depending on tier.

---

### Q: What happens if I fail Phase 5 migration?

**A:** If Prisma migration fails:

```bash
# Option 1: Rollback and retry
az postgres flexible-server delete \
  --resource-group space-prod-rg \
  --name space-db-prod \
  --yes

# Option 2: Drop schema and retry
PGPASSWORD=$DB_PASSWORD psql -h ... \
  -U postgres \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Then re-run migrations
export DATABASE_URL="postgresql://..."
cd packages/backend
npx prisma migrate deploy
```

---

### Q: Can I update the application after go-live?

**A:** Yes! Three strategies:

1. **Zero-downtime deployment** (Recommended)
   - Deploy to new App Service slot
   - Test, then switch traffic
   - Keep old version for quick rollback

2. **Quick rebuild + redeploy**
   ```bash
   npm run build --workspace @space/backend
   # Create and deploy zip
   ```

3. **Blue-green deployment** (Terraform/Bicep manages)
   - Fully automated via CI/CD

---

### Q: Do I need to configure backups?

**A:** **Yes, strongly recommended!**

```bash
# PostgreSQL automatic backups (enabled by default)
az postgres flexible-server show \
  --resource-group space-prod-rg \
  --name space-db-prod | grep -i backup

# To manually backup
az postgres flexible-server backup create \
  --resource-group space-prod-rg \
  --name space-db-prod \
  --backup-name manual-$(date +%s)
```

---

## Pre-Deployment Dry-Run (Optional but Recommended)

### 1. Test infrastructure creation locally

```bash
# Export current scripts
chmod +x scripts/*.sh

# Run Phase 1 with --dry-run
scripts/01-create-infrastructure.sh --dry-run
```

### 2. Test database connectivity

```bash
# From your local machine, test connection to PostgreSQL
psql -h YOUR_DB_SERVER.postgres.database.azure.com \
     -U postgres \
     -c "SELECT version();"
```

### 3. Verify build artifacts

```bash
# Ensure all builds pass
npm run build
npm run type-check
npm run lint

# Check artifact sizes
du -sh packages/backend/dist/
du -sh packages/frontend/dist/
```

---

## Deployment Success Criteria

✅ **Deployment is successful when:**

- [ ] Phase 1: Resource group created, Key Vault contains 3 secrets
- [ ] Phase 2: PostgreSQL responds to queries, `space_user` can connect
- [ ] Phase 3: App Service health endpoint returns `HTTP 200`
- [ ] Phase 4: Static Web App frontend loads without errors
- [ ] Phase 5: Prisma schema deployed, admin user can log in
- [ ] Phase 6: CORS allows frontend-to-backend communication
- [ ] Phase 7: Alerts configured, app visible in Application Insights

---

## Post-Deployment Tasks (Day 1)

- [ ] Change PostgreSQL admin password
- [ ] Change admin user password (in web UI)
- [ ] Configure custom domain (if applicable)
- [ ] Set up Google Analytics or equivalent
- [ ] Verify all team members can log in
- [ ] Conduct load test (optional)
- [ ] Brief support team on new URLs
- [ ] Document any deviations from runbook

---

## 24-Hour Post-Launch Monitoring

**Hour 1:**
- [ ] Monitor error rate (should be <1%)
- [ ] Check database connection pool
- [ ] Verify backup jobs running

**Hours 2-6:**
- [ ] Monitor API latency (<500ms p95)
- [ ] Check storage usage
- [ ] Verify logs are flowing to Application Insights

**Hours 6-24:**
- [ ] Check for any increase in error rate
- [ ] Verify all critical API endpoints responding
- [ ] Review user feedback
- [ ] Finalize post-launch documentation

---

**Last Updated:** June 2, 2024  
**Ready to Deploy?** Start with DEPLOYMENT_EXECUTION_GUIDE.md
