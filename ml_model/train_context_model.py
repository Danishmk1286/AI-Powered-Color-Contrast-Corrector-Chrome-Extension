# Purpose: Train context-aware color comfort model (semantic + visual features)
# Language: Python 3 (scikit-learn)

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
import joblib
import random

# ------------------------------------------------------------
# Step 1 — Load Base Dataset
# ------------------------------------------------------------
base_path = 'data/color_pairs.csv'
df = pd.read_csv(base_path)
print(f"✅ Loaded base dataset: {len(df)} samples")

# ------------------------------------------------------------
# Step 2 — Add Contextual Features (simulated for now)
# ------------------------------------------------------------
element_types = ['button', 'a', 'footer', 'header', 'h1', 'p', 'span', 'div']
element_map = {t: i+1 for i, t in enumerate(element_types)}

def random_element():
    t = random.choice(element_types)
    return t, element_map[t]

contexts = [random_element() for _ in range(len(df))]
df['element_type'] = [c[0] for c in contexts]
df['element_type_id'] = [c[1] for c in contexts]
df['font_size'] = np.random.randint(10, 24, len(df))
df['font_weight'] = np.random.choice([300, 400, 500, 600, 700], len(df))

# ------------------------------------------------------------
# Step 3 — Select Features and Labels
# ------------------------------------------------------------
features = ['fg_r','fg_g','fg_b','bg_r','bg_g','bg_b','contrast_ratio',
            'element_type_id','font_size','font_weight']
X = df[features]
y = df['label']

# ------------------------------------------------------------
# Step 4 — Train Model
# ------------------------------------------------------------
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(
    n_estimators=200,
    class_weight='balanced',
    random_state=42,
    max_depth=12
)

model.fit(X_train, y_train)

accuracy = model.score(X_test, y_test)
print(f"✅ Context-Aware Model Accuracy: {accuracy*100:.2f}%")

# ------------------------------------------------------------
# Step 5 — Save Model
# ------------------------------------------------------------
out_path = 'ml_model/color_comfort_context.pkl'
joblib.dump(model, out_path)
print(f"💾 Saved context-aware model: {out_path}")
