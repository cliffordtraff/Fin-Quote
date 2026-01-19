# Dev Server Auto-Reload Troubleshooting

## The Problem

Next.js dev server should automatically reload when you make changes, but sometimes you need to manually restart it.

## Common Causes & Solutions

### 1. Multiple Dev Server Instances Running

**Symptom:** Changes don't trigger reload, or you see multiple "ready" messages.

**Check:**
```bash
ps aux | grep "next dev" | grep -v grep
```

**Fix:**
```bash
# Kill all Next.js dev servers
pkill -f "next dev"

# Wait 2 seconds, then start fresh
npm run dev
```

**Prevention:** Always check if a dev server is already running before starting a new one.

---

### 2. TypeScript Compilation Errors

**Symptom:** Server runs but changes don't appear, no error messages visible.

**Check:**
- Look at the terminal where `npm run dev` is running
- Check for TypeScript errors (red text)
- Check browser console for errors

**Fix:**
- Fix TypeScript errors
- The server should auto-reload once errors are resolved

**Note:** Your `next.config.js` has `ignoreBuildErrors: true`, which means TypeScript errors won't block the build, but they can still prevent hot reloading.

---

### 3. File Watching Issues (macOS)

**Symptom:** Changes to files don't trigger reload, especially in large projects.

**Check file watching limits:**
```bash
sysctl kern.maxfiles kern.maxfilesperproc
```

**If limits are low (< 10000), increase them:**

**Temporary (current session):**
```bash
sudo sysctl -w kern.maxfiles=524288
sudo sysctl -w kern.maxfilesperproc=524288
```

**Permanent (add to `/etc/sysctl.conf`):**
```
kern.maxfiles=524288
kern.maxfilesperproc=524288
```

**Alternative:** Use `watchman` (Facebook's file watcher):
```bash
brew install watchman
```

Then update `package.json`:
```json
{
  "scripts": {
    "dev": "watchman watch-del-all && next dev"
  }
}
```

---

### 4. Server Crashing Silently

**Symptom:** Server stops responding, no error messages.

**Check:**
- Look for error messages in the terminal
- Check if the process is still running: `ps aux | grep "next dev"`
- Check for memory issues: `top` or Activity Monitor

**Fix:**
- Restart the dev server
- If crashes persist, check for:
  - Memory leaks in your code
  - Infinite loops
  - Unhandled promise rejections

---

### 5. Cache Issues

**Symptom:** Old code still running after changes.

**Fix:**
```bash
# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

---

### 6. Port Already in Use

**Symptom:** Server won't start, "port 3000 already in use" error.

**Fix:**
```bash
# Find what's using port 3000
lsof -ti:3000

# Kill it
kill -9 $(lsof -ti:3000)

# Or use a different port
npm run dev -- -p 3001
```

---

## Best Practices

### 1. Always Check for Running Servers

Before starting `npm run dev`, check:
```bash
ps aux | grep "next dev" | grep -v grep
```

If you see any processes, kill them first:
```bash
pkill -f "next dev"
```

### 2. Use a Single Terminal Window

- Keep the dev server running in one terminal
- Use a separate terminal for running commands (like `npm run test`)
- Don't start multiple dev servers

### 3. Monitor the Dev Server Terminal

- Keep the terminal visible where `npm run dev` is running
- Watch for error messages
- The terminal will show compilation status and errors

### 4. Check Browser Console

- Open browser DevTools (F12)
- Check Console tab for errors
- Check Network tab if data isn't loading

---

## Quick Diagnostic Commands

```bash
# 1. Check if dev server is running
ps aux | grep "next dev" | grep -v grep

# 2. Check for TypeScript errors
npm run build 2>&1 | grep -i error

# 3. Check file watching limits
sysctl kern.maxfiles kern.maxfilesperproc

# 4. Check what's using port 3000
lsof -ti:3000

# 5. Clear cache and restart
rm -rf .next && npm run dev
```

---

## Recommended Workflow

1. **Before starting work:**
   ```bash
   # Kill any existing dev servers
   pkill -f "next dev"
   
   # Clear cache if needed
   rm -rf .next
   
   # Start fresh
   npm run dev
   ```

2. **While working:**
   - Keep the dev server terminal visible
   - Watch for compilation errors
   - Check browser console for runtime errors

3. **If changes don't appear:**
   - Check the dev server terminal for errors
   - Check browser console
   - Try hard refresh (Cmd+Shift+R on Mac)
   - If still not working, restart the dev server

---

## Still Not Working?

If none of these solutions work:

1. **Check Next.js version compatibility:**
   ```bash
   npm list next
   ```
   You're on Next.js 15.5.6, which should have good HMR support.

2. **Try a clean install:**
   ```bash
   rm -rf node_modules .next
   npm install
   npm run dev
   ```

3. **Check for conflicting processes:**
   ```bash
   # Check for other Node processes
   ps aux | grep node
   
   # Check for other web servers
   lsof -i :3000
   ```

4. **Report the issue with:**
   - Next.js version: `npm list next`
   - Node version: `node --version`
   - Error messages from dev server terminal
   - Browser console errors
