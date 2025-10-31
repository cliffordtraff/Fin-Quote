# Supabase Storage Setup for Phase 4

## Create Storage Bucket (One-Time Setup)

### Step 1: Create Bucket
1. Go to your Supabase dashboard: https://hccwmbmnmbmhuslmbymq.supabase.co
2. Click **Storage** in the left sidebar
3. Click **New bucket**
4. Enter bucket name: `filings`
5. Set **Public bucket**: OFF (keep private)
6. Click **Create bucket**

### Step 2: Set Access Policies (Optional - for tighter security)
By default, only authenticated users can access. For server-only access:

1. Click on the `filings` bucket
2. Go to **Policies** tab
3. Click **New policy**
4. Template: **Custom**
5. Policy name: `Server only access`
6. Target roles: `service_role`
7. Click **Save**

## Folder Structure
Once created, scripts will organize files like:
```
filings/
├── html/
│   ├── aapl-10k-2024.html
│   ├── aapl-10q-2024-q3.html
│   └── ...
└── processed/
    └── metadata.json
```

## Testing Storage Access
After creating the bucket, run:
```bash
npx tsx scripts/test-storage.ts
```

This will verify your app can upload/download from the bucket.
