# AI ColorFix: Smart Contrast Corrector Chrome Extension

[![WCAG Compliant](https://img.shields.io/badge/WCAG-AA%20Compliant-4CAF50)](https://www.w3.org/WAI/WCAG21/quickref/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**AI ColorFix** is an intelligent Chrome extension that automatically detects and fixes low-contrast text on any website, ensuring WCAG accessibility compliance while preserving brand colors. With one click, improve readability for everyone without compromising your design aesthetic.

## 🎯 Introduction

AI ColorFix leverages advanced color science and on-device processing to enhance text readability across the web. Whether you're a developer ensuring accessibility compliance, a designer maintaining brand integrity, or a user seeking better readability, this extension provides instant, intelligent contrast corrections.

### What is AI ColorFix?

AI ColorFix is an AI-powered contrast corrector that fixes low-contrast text on any website. One click on "Scan" detects and corrects WCAG accessibility issues in real-time while preserving brand colors. It improves readability for everyone, runs fully on-device, needs no setup, and lets you adjust contrast for comfort.

### Key Highlights

- ✅ **One-Click Solution**: Scan and fix contrast issues instantly
- ✅ **Brand Color Preservation**: Maintains your design aesthetic while improving accessibility
- ✅ **WCAG 2.1 AA Compliant**: Meets international accessibility standards
- ✅ **Fully On-Device**: No data sent to external servers - complete privacy
- ✅ **Real-Time Processing**: Works instantly on any webpage you visit
- ✅ **Customizable Comfort Scale**: Adjust contrast sensitivity to your preference
- ✅ **Zero Setup Required**: Works immediately after installation

## 📦 Installation Guide

### Prerequisites

- **Browser**: Google Chrome 88+ or Chromium-based browsers (Edge, Brave, Opera)
- **OS**: Windows, macOS, Linux, or Chrome OS
- **Permissions**: Active tab access (required for page scanning)

### Manual Installation (Developer Mode)

Follow these steps to install the extension manually:

#### Step 1: Download the Extension

**Option A: Clone the Repository**
```bash
git clone https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git
cd AI-Powered-Color-Contrast-Corrector-Chrome-Extension
```

**Option B: Download as ZIP**
1. Click the green **"Code"** button on the GitHub repository page
2. Select **"Download ZIP"**
3. Extract the ZIP file to your desired location

#### Step 2: Open Chrome Extensions Page

1. Open Google Chrome browser
2. Navigate to `chrome://extensions/` in the address bar
3. Alternatively, go to **Menu (⋮)** → **More tools** → **Extensions**

#### Step 3: Enable Developer Mode

1. Look for the **"Developer mode"** toggle in the top-right corner of the extensions page
2. Toggle it **ON** (it will turn blue when enabled)

#### Step 4: Load the Extension

1. Click the **"Load unpacked"** button (appears after enabling Developer Mode)
2. Navigate to the folder where you downloaded/cloned the repository
3. Select the **root folder** of the repository (the folder containing `manifest.json`)
4. Click **"Select Folder"** or **"Open"**

#### Step 5: Verify Installation

1. The extension should now appear in your extensions list
2. You should see "AI ColorFix: Smart Contrast Corrector" with version 1.0
3. Make sure the extension is **enabled** (toggle switch should be ON)

#### Step 6: Pin to Toolbar (Optional)

1. Click the **puzzle icon (🧩)** in your Chrome toolbar
2. Find **"AI ColorFix: Smart Contrast Corrector"** in the list
3. Click the **pin icon** to keep it visible in your toolbar

### Troubleshooting Installation

**Extension not loading?**
- Ensure you selected the root folder containing `manifest.json`
- Check that Developer Mode is enabled
- Verify all files are present (no missing files error in console)

**Extension disabled automatically?**
- Check Chrome's extension error page: `chrome://extensions/`
- Look for error messages in red
- Ensure you're using Chrome 88 or later

**Can't find "Load unpacked" button?**
- Make sure Developer Mode toggle is ON (blue)
- Refresh the extensions page

## ✨ Features

### 🎨 Intelligent Color Correction

- **CIELAB Color Space Optimization**: Uses advanced color science (CIELAB color space with Delta E minimization) to find the closest color match that meets contrast requirements
- **Brand Color Preservation**: Minimizes visual changes while ensuring accessibility compliance
- **Context-Aware Adjustments**: Considers element type (headings, body text, buttons, links) for appropriate contrast targets
- **Hue Preservation**: Maintains the original color's appearance while achieving required contrast

### 🔍 Smart Detection

- **Comprehensive Page Scanning**: Analyzes all text elements, including dynamic content
- **Background Analysis**: Handles complex backgrounds including images, gradients, and transparent elements
- **Interactive Element Support**: Corrects contrast for buttons, links, and hover states
- **Real-Time Updates**: Automatically handles dynamically loaded content

### ⚙️ Customization Options

- **Comfort Scale Slider**: Adjust contrast sensitivity from 0.0 (WCAG minimum) to 1.0 (enhanced readability)
- **Auto-Correct Toggle**: Enable automatic fixes or manual review mode
- **Real-Time Preview**: See changes instantly as you adjust settings
- **Reset Functionality**: Easily revert all changes with one click

### 🛡️ Privacy & Security

- **100% On-Device Processing**: All calculations happen locally in your browser
- **No Data Collection**: No user data, browsing history, or page content is transmitted
- **No External Dependencies**: Works completely offline after installation
- **No Server Required**: All processing happens client-side

### ♿ Accessibility Features

- **WCAG 2.1 AA Compliance**: Meets 4.5:1 contrast ratio for normal text
- **WCAG 2.1 AAA Support**: Optional 7:1 ratio for enhanced accessibility
- **Large Text Handling**: Applies 3:1 ratio for headings and large text (18pt+)
- **Interactive Element Focus**: Ensures buttons and links meet contrast requirements
- **Hover State Correction**: Automatically fixes hover states for better accessibility

### 🚀 Performance

- **Fast Scanning**: Optimized algorithms for quick page analysis
- **Efficient Processing**: Handles large pages with thousands of elements
- **Memory Efficient**: Minimal resource usage
- **Non-Intrusive**: Doesn't slow down page loading or browsing

## 🤖 AI Model & Technology

### Color Correction Algorithm

AI ColorFix uses a **hybrid mathematical approach** combining advanced color science with intelligent processing:

#### 1. CIELAB Color Space Optimization

- **Color Space Conversion**: Converts RGB colors to CIELAB (L*a*b*) color space for perceptually uniform adjustments
- **Delta E Minimization**: Uses Delta E (ΔE) calculation to find the closest color match
- **Lightness Adjustment**: Preserves hue (a*) and chroma (b*) while adjusting lightness (L*) for optimal contrast
- **Perceptual Uniformity**: CIELAB ensures color changes appear uniform to human vision

#### 2. WCAG Contrast Calculation

- **Official Formula**: Implements the official WCAG 2.1 relative luminance formula
- **Contrast Ratio**: Calculates using `(L1 + 0.05) / (L2 + 0.05)` where L1 and L2 are relative luminances
- **Multiple Standards**: Supports both AA (4.5:1) and AAA (7:1) standards
- **Context-Aware Targets**: Adjusts target ratios based on element type and size

#### 3. Context-Aware Processing

- **Element Type Detection**: Identifies headings, body text, buttons, links, and interactive elements
- **Background Analysis**: Handles solid colors, images, gradients, and transparency
- **Section Classification**: Categorizes page sections for appropriate contrast targets
- **Smart Skipping**: Safely skips elements with image/video backgrounds that can't be accurately analyzed

### Technical Implementation

- **Language**: JavaScript (ES6+)
- **Chrome Extension API**: Manifest V3 compliant
- **Color Science**: CIELAB color space, Delta E 2000 formula
- **Processing**: Client-side, no server required
- **Performance**: Optimized for large pages with thousands of elements
- **Architecture**: Modular design with separate modules for utilities, error handling, and performance

### Why CIELAB?

CIELAB (International Commission on Illumination L*a*b*) is the industry standard for perceptually uniform color spaces. Unlike RGB, CIELAB represents colors in a way that matches human vision:

- **L\***: Lightness (0 = black, 100 = white)
- **a\***: Green-red axis (negative = green, positive = red)
- **b\***: Blue-yellow axis (negative = blue, positive = yellow)

**Benefits of CIELAB:**
- Perceptually uniform: Equal distances in CIELAB space represent equal perceived color differences
- Hue preservation: Adjusting only L* maintains the original color's appearance
- Industry standard: Used in professional color management and design software
- Accurate color matching: Delta E provides a reliable measure of color difference

### Algorithm Workflow

1. **Page Analysis**: Scans all text elements and identifies their current colors
2. **Contrast Calculation**: Computes current contrast ratios using WCAG formula
3. **Target Determination**: Sets appropriate contrast targets based on element type and user settings
4. **Color Optimization**: Uses CIELAB space to find optimal color adjustments
5. **Delta E Minimization**: Selects color with minimum perceptual difference
6. **Application**: Applies corrections while preserving brand colors

## 🤝 Contributing

We welcome contributions from the community! However, please review the following guidelines before submitting pull requests.

### Contribution Scope

#### ✅ What We Accept

- **Bug Fixes**: Fixes for existing functionality and edge cases
- **Performance Improvements**: Optimizations that don't change core behavior
- **UI/UX Enhancements**: Improvements to the popup interface and user experience
- **Documentation**: Clarifications, corrections, or additions to README and code comments
- **Accessibility Improvements**: Enhancements that improve the extension's accessibility features
- **Code Quality**: Refactoring that improves maintainability without changing behavior
- **Error Handling**: Better error messages and edge case handling
- **Testing**: Additional test cases and validation

#### ❌ What We Don't Accept

- **Major Feature Additions**: New features that significantly change the extension's purpose
- **API Integrations**: Changes that require external API calls or server dependencies
- **Algorithm Changes**: Modifications to the core contrast correction algorithm without discussion
- **Breaking Changes**: Changes that alter existing user workflows or settings
- **Dependency Additions**: New npm packages or external libraries (unless critical for security)
- **Privacy Violations**: Any changes that send data to external servers

### Contribution Limitations

1. **Core Algorithm**: The CIELAB-based color correction algorithm is considered stable and should not be modified without extensive discussion and testing
2. **Privacy Model**: All processing must remain on-device; no external API calls or data transmission
3. **Manifest V3 Compliance**: All code must comply with Chrome Extension Manifest V3 requirements
4. **Performance**: Contributions must not degrade scanning or correction speed
5. **Backward Compatibility**: Changes should not break existing user settings or workflows
6. **On-Device Only**: No server-side dependencies or cloud processing

### How to Contribute

1. **Fork the Repository**
   ```bash
   git clone https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git
   cd AI-Powered-Color-Contrast-Corrector-Chrome-Extension
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or for bug fixes
   git checkout -b fix/your-bug-fix
   ```

3. **Make Your Changes**
   - Follow existing code style and conventions
   - Add JSDoc comments for functions
   - Test thoroughly on multiple websites
   - Ensure no console errors

4. **Test Your Changes**
   - Load the extension in Chrome developer mode
   - Test on various websites with different color schemes
   - Verify no performance degradation
   - Check console for errors
   - Test edge cases and error scenarios

5. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```
   - Use clear, descriptive commit messages
   - Reference issue numbers if applicable

6. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   - Go to GitHub and create a Pull Request
   - Provide a clear description of changes
   - Reference any related issues
   - Include screenshots if UI changes are made

### Code Style Guidelines

- **Indentation**: Use 2 spaces (no tabs)
- **Naming**: Use meaningful variable and function names (camelCase for variables, descriptive for functions)
- **Comments**: Add JSDoc comments for functions, especially public APIs
- **Functions**: Keep functions focused and single-purpose
- **Nesting**: Avoid deep nesting (max 3 levels)
- **Error Handling**: Always handle errors gracefully
- **Console Logging**: Use appropriate log levels (console.log, console.warn, console.error)

### Reporting Issues

If you find a bug or have a suggestion:

1. **Check Existing Issues**: Search [GitHub Issues](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension/issues) to see if it's already reported

2. **Create a New Issue** with:
   - **Clear Title**: Descriptive summary of the issue
   - **Description**: Detailed explanation of the problem
   - **Steps to Reproduce**: Step-by-step instructions
   - **Expected Behavior**: What should happen
   - **Actual Behavior**: What actually happens
   - **Environment**: Browser version, OS, extension version
   - **Screenshots**: If applicable, include screenshots
   - **Console Errors**: Any error messages from browser console

3. **For Feature Requests**: Clearly describe the feature, use case, and benefits

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **WCAG 2.1 guidelines** by W3C Web Accessibility Initiative
- **CIELAB color space standards** by International Commission on Illumination (CIE)
- **Chrome Extensions API** documentation by Google
- **Open Source Community** for inspiration and feedback

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension/discussions)

## 🎯 Use Cases

- **Web Developers**: Ensure your websites meet WCAG accessibility standards
- **Designers**: Verify and improve color contrast in your designs
- **Accessibility Auditors**: Quickly identify and fix contrast issues
- **Content Creators**: Make your content readable for everyone
- **End Users**: Improve readability on any website you visit

---

**Made with ❤️ for web accessibility**

*Improving readability, one website at a time.*
