# AI ColorFix: Smart Contrast Corrector 🎨

[![WCAG Compliant](https://img.shields.io/badge/WCAG-AA%20Compliant-4CAF50)](https://www.w3.org/WAI/WCAG21/quickref/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Privacy: Local](https://img.shields.io/badge/Privacy-100%25%20On--Device-blue)](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension)

**AI ColorFix** is an intelligent, real-time contrast corrector that ensures every website you visit is accessible and readable. Using advanced color science (CIELAB), it detects low-contrast text and automatically adjusts it to meet WCAG standards while preserving the original brand aesthetic.

---

## 🎯 Key Features

* **🚀 One-Click Accessibility**: Instantly scan and repair contrast issues across any webpage.
* **🌈 Brand-Aware Correction**: Uses CIELAB Delta E optimization to find the closest accessible color, keeping the design's "feel" intact.
* **⚖️ WCAG 2.1 Compliance**: Automatically targets AA (4.5:1) or AAA (7:1) standards based on element type.
* **🔒 Privacy-First**: 100% on-device processing. No data ever leaves your browser.
* **🎚️ Comfort Scale**: A custom slider allows you to fine-tune contrast sensitivity for your specific visual needs.
* **⚡ Zero Latency**: Built with Manifest V3 for high performance even on DOM-heavy sites.

---

## 🛠 Installation Guide

### Prerequisites
* **Browser**: Chrome 88+, Edge, Brave, or any Chromium-based browser.
* **Mode**: Developer Mode must be enabled for manual installation.

### Manual Setup
1.  **Clone the Repository**:
    ```bash
    git clone [https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension.git)
    ```
    *Alternatively, download the [ZIP file](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension/archive/refs/heads/main.zip) and extract it.*

2.  **Open Extensions Page**:
    Navigate to `chrome://extensions/` in your browser.

3.  **Enable Developer Mode**:
    Toggle the switch in the **top-right corner**.

4.  **Load Unpacked**:
    Click **"Load unpacked"** and select the folder containing the `manifest.json` file.

5.  **Pin for Easy Access**:
    Click the puzzle icon (🧩) and pin **AI ColorFix** to your toolbar.

---

## 🧠 How It Works: The Technology

### The CIELAB Advantage
Traditional RGB adjustments often distort colors, making them look "muddy." AI ColorFix operates in the **CIELAB (L\*a\*b\*)** color space:
* **L\* (Lightness)**: We adjust only the lightness to reach the contrast goal.
* **a\* & b\* (Hue/Chroma)**: We preserve these axes to ensure a blue stays the *same* blue, just darker or lighter.

### The Correction Workflow
1.  **DOM Analysis**: Identifies text elements and computes their computed background (handling transparency and gradients).
2.  **Contrast Check**: Applies the WCAG 2.1 formula: $Ratio = \frac{L1 + 0.05}{L2 + 0.05}$.
3.  **Optimization Loop**: If the ratio is below the threshold, the algorithm iteratively adjusts the Lightness ($L^*$) in the CIELAB space.
4.  **Delta E Validation**: Minimizes the perceptual difference ($\Delta E$) to ensure the change is as subtle as possible for the user.

---

## ⚙️ Configuration

| Feature | Description |
| :--- | :--- |
| **Scan Mode** | Manual scan or "Auto-Correct" on page load. |
| **Comfort Scale** | Slide from 0.0 (Standard) to 1.0 (High Contrast). |
| **Standard Toggle** | Switch between WCAG AA (4.5:1) and AAA (7:1). |
| **Reset** | Revert the page to its original CSS state instantly. |

---

## 🤝 Contributing

We love contributions! To maintain the integrity of the accessibility engine, please follow these guidelines:

### Preferred Contributions
* **Bug Fixes**: Edge cases where backgrounds aren't detected correctly.
* **UI/UX**: Improving the popup interface.
* **Localization**: Adding support for more languages.

### Technical Constraints
* **No External APIs**: All logic must remain local/offline.
* **Performance**: Avoid heavy libraries; stick to vanilla JS for DOM manipulation.

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📝 License

Distributed under the **MIT License**. See `LICENSE` for more information.

## 📞 Support & Community

* **Bugs/Issues**: [GitHub Issues](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension/issues)
* **Feedback**: [Discussions](https://github.com/Danishmk1286/AI-Powered-Color-Contrast-Corrector-Chrome-Extension/discussions)

---

<p align="center">
  <b>Made with ❤️ for a more accessible web.</b><br>
  <i>Ensuring clarity for everyone, one pixel at a time.</i>
</p>
