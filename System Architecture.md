# System Architecture Verification

## Diagram Components Analysis

### Client-side Browser Environment

#### Web Page DOM
- **Present in code: YES**
- **Location:** `extension/content.js`
- **Evidence:** DOM access throughout via `document.body`, `document.querySelectorAll`, element traversal
- **Lines:** Multiple references (e.g., line 10285+ in `scanWithAI`)

#### Mutation Observer
- **Present in code: YES**
- **Location:** `extension/content.js`
- **Evidence:** 
  - Function: `startObservingDynamicContent()` at line 13016
  - Variable: `mutationObserver` at line 12939
  - Multiple MutationObserver instances created (lines 4405, 12429, 12720, 14316)
- **Purpose:** Monitors DOM changes for dynamic content

#### Style Injector
- **Present in code: YES**
- **Location:** `extension/content.js`
- **Evidence:**
  - Function: `injectStylesheet(css)` at line 1220
  - Function: `applyColorWithImportant(el, property, value)` at line 3294
- **Purpose:** Applies styles to DOM elements with !important flag

---

### Optimization Module

#### Inverse Contrast Search
- **Present in code: YES (as logic, not named module)**
- **Location:** `extension/content.js`
- **Evidence:**
  - Function: `adjustColorToContrast()` at line 6074
  - Internal function: `findOptimalColorWithMinDeltaE()` at line 6176
  - Strategy: Adjusts L* (lightness) in CIELAB space while holding a* and b* constant
  - Line 6173: Comment states "Inverse Search Strategy: Adjust L* while holding a* and b* constant"
- **Note:** Not a separate module, but logic within `adjustColorToContrast`

#### Constraints Solver (CIELAB)
- **Present in code: YES**
- **Location:** `extension/content.js`
- **Evidence:**
  - Function: `_rgb_to_lab(r, g, b)` at line 431
  - Function: `_delta_e_2000(lab1, lab2)` at line 466
  - Function: `_find_optimal_color_cielab(fg, bg, target)` at line 497
  - Function: `rgbToLab()` at line 560
  - Function: `labToRgb()` at line 601
  - Function: `deltaE2000()` at line 650
- **Purpose:** Converts RGB to CIELAB, calculates Delta E (perceptual distance), finds optimal color

#### Perceptual Distance Check
- **Present in code: YES**
- **Location:** `extension/content.js`
- **Evidence:**
  - Function: `deltaE2000()` at line 650
  - Function: `_delta_e_2000(lab1, lab2)` at line 466
  - Used in: `findOptimalColorWithMinDeltaE()` at line 6268
- **Purpose:** Calculates perceptual color difference using Delta E 2000

#### New colour (output)
- **Present in code: YES**
- **Location:** `extension/content.js`
- **Evidence:**
  - Return value from `adjustColorToContrast()` - RGB array `[r, g, b]`
  - Stored as `correctedFgRGB` in `processElementForContrast()` at line 9006
  - Converted to string format: `rgb(${r}, ${g}, ${b})` at line 9168

---

### Machine Learning Engine

#### Feature Extraction
- **Present in code: YES**
- **Location:** 
  - `api/services/feature_engine.py` - class `FeatureEngine` at line 12
  - `extension/content.js` - function `extractElementContext()` at line 8654
- **Evidence:**
  - `FeatureEngine.extract()` at line 16 in `feature_engine.py`
  - Extracts: RGB values, contrast, font size, font weight, element type, user scale
  - `extractElementContext()` extracts element metadata in content script

#### Readability Predictor (Random Forest)
- **Present in code: PARTIAL**
- **Location:** `api/services/model_loader.py`
- **Evidence:**
  - Class: `ModelLoader` at line 16
  - Model loaded via `joblib.load()` at line 55 from `.pkl` files
  - Model type detected dynamically (lines 59-69), not explicitly stated as Random Forest
  - Model files: `color_comfort_context.pkl`, `color_comfort_model.pkl` (lines 46-47)
- **Note:** Code does not explicitly state model type is Random Forest. Model type is inferred from file structure and feature count.

#### Legibility score Decision
- **Present in code: YES**
- **Location:** 
  - `api/server.py` - `/readability` endpoint at line 217
  - `extension/content.js` - `callBackendReadability()` at line 10262
- **Evidence:**
  - Returns: `comfortable` (boolean), `comfort_score` (0-1), `expected_contrast` (number)
  - Used in `processElementForContrast()` at line 8736
  - ML can veto corrections if `comfortable === true` and `comfort_score >= 0.5` (line 8747)

---

## Data Flow Comparison

### Diagram Claims:
1. Web Page DOM → Optimization Module → New colour
2. New colour → Web Page DOM update
3. Web Page DOM update → Style Injector → Machine Learning Engine
4. Machine Learning Engine → Legibility score Decision → Style Injector → Client-side Browser Environment

### Actual Code Flow:

#### Flow 1: DOM → Optimization → New colour
- **Present: YES**
- **Location:** `extension/content.js`
- **Evidence:**
  - `scanWithAI()` at line 10296 calls `processElementForContrast()` at line 10462
  - `processElementForContrast()` calls `adjustColorToContrast()` at line 9035
  - `adjustColorToContrast()` returns RGB array (line 6074)

#### Flow 2: New colour → DOM update
- **Present: YES**
- **Location:** `extension/content.js`
- **Evidence:**
  - `processElementForContrast()` receives corrected color at line 9006
  - Calls `applyColorWithImportant()` at line 9101 or 9536
  - `applyColorWithImportant()` modifies element style attribute (line 3344)

#### Flow 3: DOM update → Style Injector → ML Engine
- **Present: PARTIAL**
- **Location:** `extension/content.js`
- **Evidence:**
  - ML is called BEFORE style injection, not after
  - `callBackendReadability()` called at line 8736 in `processElementForContrast()`
  - Style injection happens AFTER ML check at line 9101
- **Mismatch:** Diagram shows ML receives DOM update. Code shows ML receives element data before correction is applied.

#### Flow 4: ML Engine → Legibility Decision → Style Injector
- **Present: YES (with modification)**
- **Location:** `extension/content.js`
- **Evidence:**
  - ML response received at line 8738
  - Decision logic at lines 8743-8752: ML can veto correction if `comfortable === true`
  - If not vetoed, `applyColorWithImportant()` called at line 9101
- **Note:** ML does not generate new colors. It only approves or vetoes CIELAB-generated colors.

---

## Execution Order

### Diagram Implies:
1. DOM observation
2. Optimization generates new color
3. Color applied to DOM
4. ML evaluates applied color
5. ML decision feeds back to style injector

### Actual Execution Order (from code):

1. **DOM Observation:** `scanWithAI()` initiates scan (line 10296)
2. **Element Processing:** `processElementForContrast()` called for each element (line 10462)
3. **ML Readability Check (optional):** `callBackendReadability()` called at line 8736 (if ML available and conditions met)
4. **Color Optimization:** `adjustColorToContrast()` called at line 9035 (CIELAB optimization)
5. **Style Application:** `applyColorWithImportant()` called at line 9101 (if correction needed and not vetoed by ML)

**Mismatch:** ML evaluation happens BEFORE color optimization in code, not after DOM update as diagram suggests.

---

## Component-by-Component Verification

### 1. Web Page DOM
- **Diagram:** Present
- **Code:** Present
- **Match:** YES

### 2. Mutation Observer
- **Diagram:** Present
- **Code:** Present
- **Match:** YES

### 3. Style Injector
- **Diagram:** Present
- **Code:** Present (`injectStylesheet`, `applyColorWithImportant`)
- **Match:** YES

### 4. Inverse Contrast Search
- **Diagram:** Present as named module
- **Code:** Present as logic within `adjustColorToContrast()`
- **Match:** PARTIAL (functionality exists, not a separate module)

### 5. Constraints Solver (CIELAB)
- **Diagram:** Present
- **Code:** Present (`_rgb_to_lab`, `_delta_e_2000`, `_find_optimal_color_cielab`)
- **Match:** YES

### 6. Perceptual Distance Check
- **Diagram:** Present
- **Code:** Present (`deltaE2000`, `_delta_e_2000`)
- **Match:** YES

### 7. New colour
- **Diagram:** Present as output
- **Code:** Present as RGB array return value
- **Match:** YES

### 8. Feature Extraction
- **Diagram:** Present
- **Code:** Present (`FeatureEngine.extract()`, `extractElementContext()`)
- **Match:** YES

### 9. Readability Predictor (Random Forest)
- **Diagram:** Present, explicitly labeled "Random Forest"
- **Code:** Present (`ModelLoader`), but model type not explicitly stated as Random Forest
- **Match:** PARTIAL (model exists, type not explicitly confirmed in code)

### 10. Legibility score Decision
- **Diagram:** Present
- **Code:** Present (`comfortable`, `comfort_score` in ML response)
- **Match:** YES

---

## Missing Components in Diagram

### Components in Code Not Shown in Diagram:

1. **Background Resolution System**
   - `getEffectiveBackgroundRGBA()` - resolves background from ancestor chain
   - `analyzeSections()` - pre-scans sections by z-index
   - Location: `extension/content.js` lines 7279+

2. **Skip Logic**
   - `shouldSkipContrastFix()` - filters elements with image backgrounds
   - Location: `extension/content.js` line 8135

3. **Hover State Correction**
   - `fixButtonHoverState()` - handles interactive element hover states
   - Location: `extension/content.js` line 4587

4. **On-Device Fallback**
   - WCAG-only mode when ML unavailable
   - Location: `extension/content.js` line 8684

5. **Rule-Based HSL Fallback**
   - `ruleBasedHslFallback()` - used when CIELAB fails
   - Location: `extension/content.js` line 337

---

## Architecture Match Decision

**The architecture does not match.**

### Mismatches:

1. **ML Evaluation Timing**
   - **Diagram claims:** ML evaluates after color is applied to DOM
   - **Code does:** ML evaluates before color optimization, can only veto corrections
   - **Location:** `extension/content.js` lines 8707-8758

2. **ML Role in Color Generation**
   - **Diagram implies:** ML may influence color generation (feedback loop to optimization)
   - **Code does:** ML is prediction-only, does not generate colors. Colors generated by CIELAB optimization only.
   - **Location:** `extension/content.js` line 10367 comment: "ML is prediction-only"

3. **Inverse Contrast Search Module**
   - **Diagram shows:** Separate module named "Inverse Contrast Search"
   - **Code has:** Logic within `adjustColorToContrast()`, not a separate module
   - **Location:** `extension/content.js` line 6176 (`findOptimalColorWithMinDeltaE`)

4. **Random Forest Model Type**
   - **Diagram labels:** "Readability Predictor (Random Forest)"
   - **Code shows:** Model loaded from `.pkl` file, type detected dynamically, not explicitly stated as Random Forest
   - **Location:** `api/services/model_loader.py` lines 55-69

5. **Data Flow Direction**
   - **Diagram shows:** DOM update → Style Injector → ML Engine
   - **Code does:** Element data → ML Engine (before correction) → Color Optimization → Style Injector
   - **Location:** `extension/content.js` lines 8724-9101

6. **Feedback Loop**
   - **Diagram shows:** ML decision feeds back to Style Injector in Client-side Browser Environment
   - **Code does:** ML decision (veto) prevents style injection, but does not generate new colors
   - **Location:** `extension/content.js` lines 8747-8752

---

## Summary

All major components from the diagram exist in the code, but:
- Execution order differs (ML before optimization, not after)
- ML role is prediction-only (veto), not color generation
- Some components are integrated into larger functions rather than separate modules
- Model type not explicitly confirmed as Random Forest in code
- Additional components exist in code not shown in diagram



