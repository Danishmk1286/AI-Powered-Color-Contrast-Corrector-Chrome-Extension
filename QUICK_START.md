# Quick Start: Push to GitHub

## Fastest Method (Command Line)

Open PowerShell or Command Prompt in the `github` folder and run:

```bash
cd "C:\Users\Khan\Documents\wcag-contrast-extension\color-contrast-ai - V3.0 - Final - Copy\github"

git init
git remote add origin https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git
git add .
git commit -m "Initial commit: AI ColorFix Chrome Extension"
git branch -M main
git push -u origin main
```

**Note**: When prompted for credentials:
- Username: Your GitHub username
- Password: Use a Personal Access Token (not your GitHub password)

## Create Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: "Chrome Extension Repo"
4. Select: `repo` scope
5. Click "Generate token"
6. Copy the token and use it as your password

## Verify Upload

Visit: https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension

You should see all your files including the README.md!

---

For detailed instructions, see [GITHUB_PUSH_GUIDE.md](GITHUB_PUSH_GUIDE.md)

