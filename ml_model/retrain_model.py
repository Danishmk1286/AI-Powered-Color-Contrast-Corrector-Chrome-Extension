# Purpose: Retrain AI color comfort model using user feedback data
# Language: Python 3

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib

# --------------------------------------------------------
# Step 1 — Load original dataset
# --------------------------------------------------------
original = pd.read_csv('data/color_pairs.csv')

# --------------------------------------------------------
# Step 2 — Load user feedback
# --------------------------------------------------------
feedback = pd.read_csv('data/user_feedback_clean.csv')

# --------------------------------------------------------
# Step 3 — Generate simple numeric features from feedback
# --------------------------------------------------------
# We'll turn the feedback into additional labeled samples.
# For simplicity, assign comfort levels based on feedback:
#   comfortable → label 1
#   uncomfortable → label 0
feedback['label'] = feedback['status'].map({'comfortable': 1, 'uncomfortable': 0})

# Create some synthetic feature placeholders (since we only have feedback now)
# For now, randomly sample colors or assume typical medium contrasts.
import numpy as np
synthetic_data = pd.DataFrame({
    'fg_r': np.random.randint(0, 255, size=len(feedback)),
    'fg_g': np.random.randint(0, 255, size=len(feedback)),
    'fg_b': np.random.randint(0, 255, size=len(feedback)),
    'bg_r': np.random.randint(0, 255, size=len(feedback)),
    'bg_g': np.random.randint(0, 255, size=len(feedback)),
    'bg_b': np.random.randint(0, 255, size=len(feedback)),
    'contrast_ratio': np.random.uniform(1, 10, size=len(feedback)),
    'label': feedback['label']
})

# --------------------------------------------------------
# Step 4 — Merge both datasets
# --------------------------------------------------------
combined = pd.concat([original, synthetic_data], ignore_index=True)
print(f"Combined dataset size: {combined.shape}")

# --------------------------------------------------------
# Step 5 — Train a new Random Forest model
# --------------------------------------------------------
X = combined[['fg_r', 'fg_g', 'fg_b', 'bg_r', 'bg_g', 'bg_b', 'contrast_ratio']]
y = combined['label']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=250, max_depth=10, random_state=42)
model.fit(X_train, y_train)

# --------------------------------------------------------
# Step 6 — Evaluate and save personalized model
# --------------------------------------------------------
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"✅ Personalized Model Accuracy: {acc*100:.2f}%")

joblib.dump(model, 'ml_model/color_comfort_model_personalized.pkl')
print("💾 Saved personalized model as ml_model/color_comfort_model_personalized.pkl")
