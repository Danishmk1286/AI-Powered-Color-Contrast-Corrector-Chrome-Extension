# Guide: Pushing Code to GitHub Repository

This guide will walk you through the process of pushing the extension code to your GitHub repository.

## Prerequisites

1. **Git Installed**: Make sure Git is installed on your system
   - Check: `git --version`
   - Download: https://git-scm.com/downloads

2. **GitHub Account**: You need access to the repository
   - Repository URL: `https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension`

3. **GitHub Authentication**: Set up authentication (choose one method)
   - **Option A**: Personal Access Token (PAT)
   - **Option B**: SSH Key
   - **Option C**: GitHub CLI

## Step-by-Step Instructions

### Method 1: Using Command Line (Recommended)

#### Step 1: Navigate to the GitHub Folder

```bash
cd "C:\Users\Khan\Documents\wcag-contrast-extension\color-contrast-ai - V3.0 - Final - Copy\github"
```

#### Step 2: Initialize Git Repository (if not already initialized)

```bash
git init
```

#### Step 3: Add Remote Repository

```bash
git remote add origin https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git
```

**Note**: If the remote already exists, you can update it:
```bash
git remote set-url origin https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git
```

#### Step 4: Check Current Status

```bash
git status
```

#### Step 5: Add All Files

```bash
git add .
```

#### Step 6: Commit Changes

```bash
git commit -m "Initial commit: AI ColorFix Chrome Extension with SEO-optimized README"
```

#### Step 7: Set Up Branch (if first time)

```bash
git branch -M main
```

#### Step 8: Push to GitHub

**If this is the first push:**
```bash
git push -u origin main
```

**For subsequent pushes:**
```bash
git push origin main
```

**If you encounter authentication issues**, you may need to use a Personal Access Token:
```bash
# When prompted for password, use your Personal Access Token instead
git push -u origin main
```

### Method 2: Using GitHub Desktop

1. **Download GitHub Desktop**: https://desktop.github.com/

2. **Open GitHub Desktop** and sign in with your GitHub account

3. **Add Repository**:
   - Click "File" → "Add Local Repository"
   - Browse to: `C:\Users\Khan\Documents\wcag-contrast-extension\color-contrast-ai - V3.0 - Final - Copy\github`
   - Click "Add Repository"

4. **Publish Repository**:
   - Click "Publish repository" button
   - Repository name: `AI-Powered-Color-Contrast-Corrector-Chrome-Extension`
   - Make sure "Keep this code private" is unchecked (if you want it public)
   - Click "Publish Repository"

5. **For Future Updates**:
   - Make changes to files
   - Write commit message in bottom-left
   - Click "Commit to main"
   - Click "Push origin" button

### Method 3: Using VS Code

1. **Open Folder in VS Code**:
   - File → Open Folder
   - Select: `C:\Users\Khan\Documents\wcag-contrast-extension\color-contrast-ai - V3.0 - Final - Copy\github`

2. **Initialize Git** (if needed):
   - Open Terminal in VS Code (Ctrl + `)
   - Run: `git init`

3. **Add Remote**:
   - Terminal: `git remote add origin https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git`

4. **Stage Files**:
   - Click Source Control icon (left sidebar)
   - Click "+" next to "Changes" to stage all files
   - Or use: `git add .` in terminal

5. **Commit**:
   - Enter commit message
   - Press Ctrl+Enter or click checkmark

6. **Push**:
   - Click "..." menu → "Push"
   - Or use: `git push -u origin main`

## Authentication Setup

### Option A: Personal Access Token (PAT)

1. **Create Token**:
   - Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Name: "Chrome Extension Repo"
   - Select scopes: `repo` (full control)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again)

2. **Use Token**:
   - When Git prompts for password, paste the token instead
   - Username: Your GitHub username

### Option B: SSH Key

1. **Generate SSH Key**:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Add to SSH Agent**:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```

3. **Copy Public Key**:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

4. **Add to GitHub**:
   - GitHub.com → Settings → SSH and GPG keys → New SSH key
   - Paste your public key
   - Save

5. **Update Remote URL**:
   ```bash
   git remote set-url origin git@github.com:Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git
   ```

## Troubleshooting

### Error: "Repository not found"
- Check repository URL is correct
- Verify you have access to the repository
- Ensure you're authenticated

### Error: "Authentication failed"
- Use Personal Access Token instead of password
- Check token has `repo` scope
- Verify token hasn't expired

### Error: "Updates were rejected"
- Someone else pushed changes
- Solution: Pull first, then push
  ```bash
  git pull origin main --rebase
  git push origin main
  ```

### Error: "Branch 'main' has no upstream branch"
- Use: `git push -u origin main` (the `-u` flag sets upstream)

### Error: "Large files detected"
- Check `.gitignore` is working
- Remove large files: `git rm --cached large-file.js`
- Commit: `git commit -m "Remove large file"`

## Updating the Repository

For future updates:

1. **Make Changes** to files in the `github` folder

2. **Check Status**:
   ```bash
   git status
   ```

3. **Add Changes**:
   ```bash
   git add .
   ```

4. **Commit**:
   ```bash
   git commit -m "Description of your changes"
   ```

5. **Push**:
   ```bash
   git push origin main
   ```

## Quick Reference Commands

```bash
# Check status
git status

# Add all files
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push origin main

# Pull latest changes
git pull origin main

# View commit history
git log --oneline

# Check remote URL
git remote -v
```

## Next Steps After Pushing

1. **Verify on GitHub**: Visit your repository to confirm files are uploaded
2. **Add Repository Description**: Go to repository Settings → Update description
3. **Add Topics**: Add tags like `chrome-extension`, `accessibility`, `wcag`, `color-contrast`
4. **Create Release**: Tag a version for releases
5. **Enable GitHub Pages** (optional): For hosting documentation

---

**Need Help?** Check GitHub documentation: https://docs.github.com/en/get-started

