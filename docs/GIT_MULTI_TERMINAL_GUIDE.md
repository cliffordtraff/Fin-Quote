# Git Multi-Terminal Workflow Guide: Preventing Branch-Switching Issues

## The Problem That Happened

You were working in Cursor making changes on the `feature/chatbot-homepage` branch. At the same time, you asked Claude Code (in a separate terminal) to "save to GitHub and create a new branch." Claude Code ran `git checkout main`, which **suddenly changed all your files** in Cursor to show the old `main` branch code, making your recent work seem to disappear.

---

## Understanding How Git Branches Work (For Beginners)

### The Single Working Directory Concept

**Key Truth #1: You only have ONE copy of your project folder on your computer.**

Your project lives here:
```
/Users/cliffordtraff/Desktop/Fin Quote
```

This is your **working directory** - the actual files and folders you can see and edit.

### What Branches Are

Branches are **NOT separate folders**. Think of them like this:

**Wrong mental model:**
```
Desktop/
  ├── Fin Quote (main branch)/
  ├── Fin Quote (feature/chatbot-homepage)/
  └── Fin Quote (feature/reasoning-visibility)/
```

**Correct mental model:**
```
Desktop/
  └── Fin Quote/  ← ONE folder that changes its contents based on which branch is active
```

Git stores all branch versions in a hidden `.git` folder, but you only see **one version at a time** in your working directory.

### What Happens When You Switch Branches

When you run `git checkout <branch-name>`, git:

1. **Saves** any uncommitted changes (or warns you)
2. **Physically replaces** the files in your working directory with the files from the target branch
3. **Updates** a pointer (called HEAD) to track which branch you're on

**Example:**

```bash
# You're on feature/chatbot-homepage
# Your app/page.tsx contains chatbot code (200 lines)

git checkout main

# Git physically replaces app/page.tsx with the main version
# Now app/page.tsx has the old market data code (150 lines)
# The chatbot code isn't deleted - it's stored in .git
# But your WORKING DIRECTORY now shows the old version
```

### Why ALL Terminals and Editors See the Change

**Key Truth #2: Git state is shared across all programs accessing the same folder.**

When you have multiple things open:
- Terminal 1 (Claude Code)
- Terminal 2 (your manual commands)
- Cursor editor
- VS Code
- Finder window

**They all look at the SAME folder.** There's no separation.

So when Claude Code runs `git checkout main` in Terminal 1:
- ✓ Terminal 1 sees main
- ✓ Terminal 2 sees main
- ✓ Cursor sees main
- ✓ VS Code sees main
- ✓ Finder sees main

**Everything sees the same files instantly** because they're all looking at the same physical folder.

---

## What Exactly Happened Step-by-Step

### Before the Problem

**State:**
- Current branch: `feature/chatbot-homepage`
- Working directory: Shows chatbot homepage code
- Claude Code terminal: Sees chatbot code
- Cursor editor: Sees chatbot code
- Git status: Clean (all changes committed)

### When You Asked Claude Code to "Save to GitHub and Create New Branch"

**Claude Code executed:**
```bash
git checkout main                            # Step 1: Switch to main
git checkout -b feature/reasoning-visibility # Step 2: Create new branch from main
git push -u origin feature/reasoning-visibility # Step 3: Push to GitHub
```

**What happened at Step 1 (`git checkout main`):**

1. Git checked: "Are there uncommitted changes on feature/chatbot-homepage?" → No (clean)
2. Git replaced all files in `/Users/cliffordtraff/Desktop/Fin Quote/` with `main` versions
3. Git updated HEAD pointer to `main`

**Immediate effects:**
- Claude Code terminal: Now on `main` branch
- Cursor editor: **Files suddenly changed to old versions**
- Your working directory: Shows code from `main` (doesn't have chatbot homepage)
- Your recent commits: Still safe in `feature/chatbot-homepage`, but not visible

### Why It Looked Like Your Work Disappeared

**In Cursor:**
- One moment: `app/page.tsx` has your chatbot homepage code
- Next moment: `app/page.tsx` has old market data code
- **Your changes weren't deleted** - the file just got swapped out

**Your commits were safe the whole time** in the `feature/chatbot-homepage` branch. They just weren't visible because the working directory was showing `main`.

### How We Fixed It

```bash
git checkout feature/chatbot-homepage
```

This put the files back:
- Git replaced the files in your folder with the `feature/chatbot-homepage` versions
- Cursor editor showed your chatbot code again
- Everything back to normal

---

## Why This Is Confusing for Beginners

### The File Swapping Is Invisible

When you switch branches, you don't see:
- ❌ A progress bar saying "Replacing 47 files..."
- ❌ A warning in Cursor saying "Your files are being changed by git"
- ❌ Any visual indication that something is happening

It just **happens instantly and silently**.

### Multiple Terminals Don't Mean Isolation

In other contexts, having multiple terminal windows means they're independent. But with git:
- All terminals share the same repository state
- All terminals see the same current branch
- All terminals affect the same working directory

### Editors Don't Know About Git Operations

When Claude Code runs `git checkout main`:
- Cursor doesn't get a notification
- Cursor just notices "Oh, these files changed on disk"
- Cursor reloads them (thinking maybe you edited them manually)
- You see different code suddenly

---

## The Root Cause: Context Mismatch

**What Claude Code knew:**
- You asked to "save to GitHub and create a new branch"
- Claude Code checked `git status` and saw changes on `feature/chatbot-homepage`
- Claude Code assumed you wanted to branch from `main` (standard practice)

**What Claude Code didn't know:**
- You had Cursor open on `feature/chatbot-homepage`
- You were actively working on that branch
- Switching away would disrupt your work
- You wanted to create a branch from your current work, not from `main`

**The miscommunication:**
- You meant: "Save my current work and create a new branch for the reasoning visibility feature"
- Claude Code did: "Commit current changes, then create a new branch from `main`"

---

## Solutions and Best Practices Going Forward

### Solution 1: Always Tell Claude Code Your Current Branch

**Before asking Claude Code to create branches, say:**

✅ **Good:**
> "I'm currently on `feature/chatbot-homepage`. Please create a new branch called `feature/reasoning-visibility` from my current branch."

❌ **Risky:**
> "Create a new branch for reasoning visibility"

**Why this helps:**
- Claude Code knows your context
- Claude Code can branch from your current work
- No unexpected branch switching

### Solution 2: Specify Where to Branch From

**Be explicit:**

✅ **Good:**
> "Create a new branch from `feature/chatbot-homepage` called `feature/reasoning-visibility`"

Or:
> "Create a new branch from `main` called `feature/reasoning-visibility`"

**This makes your intent crystal clear.**

### Solution 3: Ask Claude Code to Check First

✅ **Good:**
> "What branch am I currently on? Then create a new branch for reasoning visibility."

**Claude Code will run:**
```bash
git branch --show-current  # Shows: feature/chatbot-homepage
```

Then you can decide where to branch from.

### Solution 4: Commit Often in Cursor, Then Notify Claude Code

**Workflow:**

1. **In Cursor:** Make changes, test them
2. **In Cursor terminal:** Commit your work
   ```bash
   git add .
   git commit -m "Add feature X"
   ```
3. **Tell Claude Code:**
   > "I just committed changes on `feature/chatbot-homepage`. Please push this branch to GitHub."

**Why this works:**
- You maintain control of commits
- Claude Code just pushes (doesn't switch branches)
- No surprises

### Solution 5: Use Git Status Before Major Operations

**Safe workflow:**

**You ask:**
> "Please create a new branch for feature X"

**Claude Code should first check:**
```bash
git status
git branch --show-current
```

**Then ask you:**
> "You're currently on `feature/chatbot-homepage` with uncommitted changes. Should I:
> A) Commit these changes first, then create new branch from here?
> B) Create new branch from `main` instead?
> C) Stash changes and create branch from `main`?"

*Note: I can implement this as a standard practice going forward.*

### Solution 6: Create Branches Manually When Needed

**For complex workflows, you can create branches yourself:**

**In Cursor terminal:**
```bash
# Check where you are
git branch --show-current

# Create new branch from current location
git checkout -b feature/new-feature

# Or create from main
git checkout main
git checkout -b feature/new-feature

# Push to GitHub
git push -u origin feature/new-feature
```

Then tell Claude Code:
> "I'm now on `feature/new-feature`. Please implement X."

---

## Understanding Git Commands That Affect Your Working Directory

### Commands That Change Your Files (DANGEROUS when working in multiple terminals)

| Command | What It Does | Risk Level |
|---------|-------------|------------|
| `git checkout <branch>` | Switches branch, replaces all files | 🔴 HIGH |
| `git checkout <commit>` | Shows old version, replaces files | 🔴 HIGH |
| `git reset --hard` | Discards changes, replaces files | 🔴 CRITICAL |
| `git pull` | Downloads changes, may replace files | 🟡 MEDIUM |
| `git merge <branch>` | Combines branches, may change files | 🟡 MEDIUM |
| `git rebase` | Rewrites history, changes files | 🔴 HIGH |
| `git stash pop` | Restores stashed changes | 🟡 MEDIUM |

### Commands That Are Safe (Don't change working directory)

| Command | What It Does | Risk Level |
|---------|-------------|------------|
| `git status` | Shows current state | ✅ SAFE |
| `git log` | Shows commit history | ✅ SAFE |
| `git branch` | Lists branches | ✅ SAFE |
| `git diff` | Shows uncommitted changes | ✅ SAFE |
| `git add` | Stages changes | ✅ SAFE |
| `git commit` | Saves staged changes | ✅ SAFE |
| `git push` | Uploads to GitHub | ✅ SAFE |
| `git fetch` | Downloads info (doesn't merge) | ✅ SAFE |

---

## How Git Stores Your Work (Behind the Scenes)

### The .git Folder

Everything git knows is stored in:
```
/Users/cliffordtraff/Desktop/Fin Quote/.git/
```

**What's inside:**
- `HEAD` - File that says which branch you're on
- `refs/heads/` - Pointers to each branch's latest commit
- `objects/` - Compressed storage of all your commits, files, history

**When you switch branches:**
```bash
git checkout feature/chatbot-homepage
```

Git:
1. Reads `.git/refs/heads/feature/chatbot-homepage` → finds commit ID `b983c54`
2. Reads `.git/objects/` → finds all files for commit `b983c54`
3. Extracts those files into your working directory
4. Updates `.git/HEAD` to point to `feature/chatbot-homepage`

**Your working directory becomes a "snapshot" of that branch.**

### Where Your Commits Live

**All commits are stored in `.git/objects/`:**
- Commit `b983c54` (Remove follow-up questions) - stored
- Commit `7fdd90e` (Fix auto-scroll) - stored
- Commit `9e7fa14` (Restructure UI) - stored
- All files from all commits - stored

**They never disappear**, even when you switch branches. Switching branches just changes **which commit's files you see** in your working directory.

---

## Recovering From Branch Switch Accidents

### If You Had Uncommitted Changes

**Scenario:** You were editing files, hadn't committed, then Claude Code switched branches.

**What happens:**
- Git either:
  - **Preserves your changes** if they don't conflict with the target branch
  - **Refuses to switch** and shows an error: "error: Your local changes would be overwritten"

**If git switched and you lost changes:**

1. **Check git stash:**
   ```bash
   git stash list
   ```
   If you see stashes, restore with:
   ```bash
   git stash pop
   ```

2. **Check editor recovery:**
   - Cursor has local file history: Right-click file → "Local History"
   - May have auto-saved versions

3. **Check for uncommitted changes on the branch:**
   ```bash
   git checkout feature/chatbot-homepage
   git status  # Shows if you have uncommitted changes
   ```

### If Your Commits Are Missing

**Don't panic.** Commits are almost never lost.

**Recovery steps:**

1. **Check all branches:**
   ```bash
   git branch -a
   ```
   Your commit might be on a different branch than you thought.

2. **Check reflog (git's safety net):**
   ```bash
   git reflog
   ```
   This shows EVERY operation you've done. Find your commit, then:
   ```bash
   git checkout <commit-hash>
   git checkout -b recovered-work  # Create branch from that commit
   ```

3. **Search for commits by message:**
   ```bash
   git log --all --grep="your commit message"
   ```

**In our case, your commits were safe on `feature/chatbot-homepage` - they just weren't visible when you were on `main`.**

---

## Best Practices for Claude Code + Cursor Workflow

### 1. Establish a Single Source of Truth

**Option A: Let Claude Code manage git**
- Make all commits through Claude Code
- Don't commit in Cursor terminal
- Just edit files in Cursor, let Claude Code commit

**Option B: You manage git, Claude Code just codes**
- Commit manually in Cursor terminal
- Tell Claude Code "don't use git commands"
- Claude Code only edits files

**Option C: Clear handoff (Recommended)**
- Edit in Cursor
- When ready to commit/push, tell Claude Code explicitly:
  > "Please commit my changes on the current branch and push to GitHub"

### 2. Always State Your Current Context

**When asking Claude Code to do git operations:**

✅ **Good examples:**
- "I'm on `feature/chatbot-homepage`. Please create a new branch for X from this branch."
- "I'm on `main`. Please create a feature branch for X."
- "Please check what branch I'm on, then create a new branch for X."

❌ **Risky examples:**
- "Create a new branch"
- "Save to GitHub"
- "Make a new feature branch"

### 3. Commit Before Major Operations

**Before asking for new branches:**

**In Cursor terminal:**
```bash
git add .
git commit -m "WIP: Current work"
```

**Then tell Claude Code:**
> "I just committed my work. Please create a new branch for X."

**This ensures:**
- Your work is saved
- Claude Code knows the current state
- You can switch branches safely

### 4. Use `git status` Liberally

**Good habit:**

**You ask:**
> "Create a new branch for reasoning visibility"

**Claude Code should respond:**
> "Let me check the current git state first..."
> ```
> git status
> git branch --show-current
> ```
> "You're on `feature/chatbot-homepage` with clean working tree. Should I create the new branch from here, or from `main`?"

### 5. Avoid Concurrent Git Operations

**Dangerous:**
- Claude Code is running `git push` in one terminal
- You run `git commit` in Cursor at the same time

**Safe:**
- Wait for Claude Code to finish git operations
- Or tell Claude Code "I'll handle git for now"

### 6. Communicate Branch Expectations

**When starting new work:**

**Tell Claude Code:**
> "I want to work on feature X. It should be based on the current `feature/chatbot-homepage` work. Please create a branch called `feature/X` from my current branch."

**Claude Code will:**
```bash
git checkout feature/chatbot-homepage  # Ensure we're on the right branch
git checkout -b feature/X              # Create new branch from here
git push -u origin feature/X           # Push to GitHub
```

No surprises.

---

## Quick Reference: Safe Commands for Claude Code

### Safe Git Commands (Won't Disrupt Your Work)

**Always safe to ask Claude Code:**
- "What branch am I on?"
- "Show me recent commits"
- "Show me git status"
- "Push the current branch to GitHub"
- "Commit the current changes with message X"
- "Show me what files changed"

### Commands That Need Context

**Require you to specify:**
- "Create a new branch" → **Specify: from where?**
- "Merge branches" → **Specify: which ones?**
- "Switch to a different branch" → **Specify: Should we commit current work first?**
- "Reset changes" → **Specify: Which changes? Hard or soft?**

### Commands to Avoid in Multi-Terminal Workflows

**Don't ask Claude Code to:**
- "Switch to `main`" (while you're working in Cursor)
- "Reset to previous commit" (might lose work)
- "Delete branches" (might delete wrong one)

**Instead, do these manually** when you're ready and aware.

---

## Mental Model Summary

### Key Concepts to Remember

1. **One Working Directory**
   - Only ONE copy of files on disk
   - All terminals/editors see the same files
   - Git changes these files when you switch branches

2. **Branches Are Pointers**
   - Branches aren't folders
   - They're pointers to commits
   - Switching branches = showing different commit's files

3. **Git State Is Global**
   - Current branch affects all terminals
   - Git operations affect all programs
   - No isolation between terminals

4. **Your Work Is Always Safe (If Committed)**
   - Commits are stored in `.git/objects/`
   - Switching branches doesn't delete commits
   - You can always get back to committed work

5. **Communication Is Key**
   - Tell Claude Code your context
   - Specify which branch to work from
   - Ask for confirmation before major operations

---

## Troubleshooting Common Scenarios

### "My files suddenly changed in Cursor!"

**Cause:** Someone/something ran `git checkout <different-branch>`

**Solution:**
1. Check current branch: `git branch --show-current`
2. Switch back: `git checkout <your-branch>`

### "Claude Code created a branch but I'm not on it"

**Cause:** Claude Code ran `git checkout -b <branch>` from wrong starting point

**Solution:**
1. See where you are: `git branch --show-current`
2. See all branches: `git branch -a`
3. Switch to desired branch: `git checkout <desired-branch>`

### "My recent commits disappeared!"

**Cause:** You switched to a branch that doesn't have those commits

**Solution:**
1. Find your commits: `git reflog`
2. Find the right branch: `git branch -a`
3. Switch to that branch: `git checkout <branch-with-commits>`

### "Claude Code won't let me switch branches"

**Error:** `error: Your local changes would be overwritten`

**Cause:** You have uncommitted changes that conflict with target branch

**Solution:**
1. Commit your changes: `git add . && git commit -m "WIP"`
2. Or stash them: `git stash`
3. Then switch: `git checkout <branch>`
4. Restore stash if needed: `git stash pop`

---

## Action Items for You

### Immediate Actions

- [ ] **Save this guide** in your docs folder
- [ ] **Bookmark this file** for quick reference
- [ ] **Read the "Mental Model Summary"** section until it clicks

### Before Each Session

- [ ] **Check current branch:** `git branch --show-current`
- [ ] **Commit any WIP:** `git add . && git commit -m "WIP: <description>"`
- [ ] **Tell Claude Code:** "I'm on `<branch-name>` working on X"

### When Asking Claude Code to Use Git

- [ ] **State your current branch:** "I'm on `feature/X`"
- [ ] **Specify intent:** "Create new branch from current branch" vs "from main"
- [ ] **Ask for confirmation:** "Please check git status first"

### When Something Goes Wrong

- [ ] **Don't panic** - commits are rarely lost
- [ ] **Check reflog:** `git reflog`
- [ ] **Switch to the right branch:** `git checkout <correct-branch>`
- [ ] **Ask Claude Code for help:** "Help me recover from a git issue"

---

## Conclusion

**The core issue:** Git operates on a single working directory that all programs share. When Claude Code switches branches, it changes the files for everyone - including your Cursor editor.

**The solution:** Clear communication about context. Always tell Claude Code which branch you're on and where you want new branches created from.

**Going forward:** Think of Claude Code and Cursor as two people working on the same desk. If one person swaps out all the papers, the other person will notice. They need to coordinate.

By following the practices in this guide, you'll avoid the "my files suddenly changed" surprise and have a smooth multi-terminal workflow.
