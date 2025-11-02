# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for your Fin Quote application.

---

## Step 1: Create Google OAuth Credentials

### 1.1 Go to Google Cloud Console

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Create a new project or select an existing one

### 1.2 Enable Google+ API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on it and click **Enable**

### 1.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type (unless you have a Google Workspace)
3. Click **Create**
4. Fill in the required fields:
   - **App name**: Fin Quote
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click **Save and Continue**
6. Skip the "Scopes" section (click **Save and Continue**)
7. Add test users if needed (during development)
8. Click **Save and Continue**

### 1.4 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Fill in the fields:
   - **Name**: Fin Quote Web Client
   - **Authorized JavaScript origins**:
     - `http://localhost:3003` (for local development)
     - Your production URL (e.g., `https://finquote.com`)
   - **Authorized redirect URIs**:
     - `http://localhost:3003/auth/callback` (for local development)
     - `https://your-project-id.supabase.co/auth/v1/callback`
     - Your production callback URL (e.g., `https://finquote.com/auth/callback`)
5. Click **Create**
6. **Copy the Client ID and Client Secret** - you'll need these!

---

## Step 2: Configure Supabase

### 2.1 Add Google Provider in Supabase Dashboard

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Authentication** → **Providers**
4. Find **Google** in the list
5. Toggle it to **Enabled**
6. Paste your credentials:
   - **Client ID**: The Client ID from Google Cloud Console
   - **Client Secret**: The Client Secret from Google Cloud Console
7. Click **Save**

### 2.2 Get Your Callback URL

Your Supabase callback URL is:
```
https://<your-project-id>.supabase.co/auth/v1/callback
```

Make sure this URL is added to your Google OAuth credentials (see Step 1.4 above).

---

## Step 3: Test Google OAuth

### 3.1 Local Testing

1. Make sure your dev server is running:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3003/ask`

3. Click **Login / Sign Up**

4. Click **Continue with Google**

5. You should be redirected to Google's sign-in page

6. After signing in, you'll be redirected back to `/ask` and logged in!

### 3.2 Verify in Supabase

1. Go to Supabase Dashboard → **Authentication** → **Users**
2. You should see your Google account listed
3. The user will have a `provider` field set to `google`

---

## Step 4: Production Setup

When deploying to production:

1. **Update Google OAuth Credentials**:
   - Add your production domain to **Authorized JavaScript origins**
   - Add your production callback URL to **Authorized redirect URIs**

2. **Verify Supabase Settings**:
   - Ensure the Supabase callback URL is in Google's authorized redirects
   - Check that Site URL is set correctly in Supabase Auth settings

3. **Test the flow** on your production domain

---

## Troubleshooting

### "redirect_uri_mismatch" Error

**Cause**: The callback URL doesn't match what's configured in Google Cloud Console.

**Solution**:
1. Check the error message for the actual redirect URI being used
2. Add that exact URI to your Google OAuth credentials
3. Common URIs to add:
   - `https://<project-id>.supabase.co/auth/v1/callback`
   - `https://your-domain.com/auth/callback`

### "Access blocked: This app's request is invalid"

**Cause**: OAuth consent screen not properly configured.

**Solution**:
1. Go back to Google Cloud Console → OAuth consent screen
2. Ensure all required fields are filled
3. Add your email as a test user if the app is in testing mode
4. Publish the app if ready for production

### Users can sign in but get logged out immediately

**Cause**: Cookie/session issues.

**Solution**:
1. Check browser console for errors
2. Ensure `@supabase/auth-helpers-nextjs` is installed
3. Verify the auth callback route exists at `/app/auth/callback/route.ts`
4. Check that cookies are enabled in the browser

### "Invalid OAuth client" Error

**Cause**: Client ID or Client Secret is incorrect.

**Solution**:
1. Go to Supabase Dashboard → Authentication → Providers → Google
2. Verify the Client ID and Client Secret match what's in Google Cloud Console
3. Re-copy them if needed (make sure no extra spaces)

---

## Security Best Practices

1. **Never commit OAuth secrets** to version control
2. **Use environment variables** for production credentials
3. **Limit authorized domains** to only your actual domains
4. **Review Google's security checklist** before going to production
5. **Enable 2FA** on your Google Cloud account

---

## Additional Features

### Request Additional Scopes

If you need access to more Google data (e.g., Gmail, Calendar), modify the OAuth request:

```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    scopes: 'email profile https://www.googleapis.com/auth/calendar.readonly',
  },
})
```

Then update your OAuth consent screen scopes in Google Cloud Console.

---

## Support

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Docs](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Discord](https://discord.supabase.com/)

---

**You're all set!** 🎉

Users can now sign in with Google and their query history will be saved to their account.
