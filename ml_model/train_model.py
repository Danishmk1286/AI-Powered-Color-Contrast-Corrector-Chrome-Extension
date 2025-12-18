# Purpose: Train a supervised ML model to predict color comfort
# Language: Python 3 (using scikit-learn)

# -------------------------------------------------
# Step 1 — Import required libraries
# -------------------------------------------------
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib

# -------------------------------------------------
# Step 2 — Load dataset
# -------------------------------------------------
# Load the CSV you generated in Phase 1
data = pd.read_csv('data/color_pairs.csv')
print(f"✅ Dataset loaded: {data.shape[0]} samples")

# Define feature columns (inputs for the model)
X = data[['fg_r', 'fg_g', 'fg_b', 'bg_r', 'bg_g', 'bg_b', 'contrast_ratio']]
# Define the label (target)
y = data['label']

# -------------------------------------------------
# Step 3 — Split data into training and testing sets
# -------------------------------------------------
# We’ll use 80% of the data to train and 20% to test accuracy
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# -------------------------------------------------
# Step 4 — Create and train the model
# -------------------------------------------------
model = RandomForestClassifier(
    n_estimators=200,   # number of decision trees
    max_depth=8,        # depth of each tree
    random_state=42
)
model.fit(X_train, y_train)

# -------------------------------------------------
# Step 5 — Evaluate model performance
# -------------------------------------------------
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)

print(f"✅ Model accuracy: {accuracy * 100:.2f}%")
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# -------------------------------------------------
# Step 6 — Save the trained model
# -------------------------------------------------
joblib.dump(model, 'ml_model/color_comfort_model.pkl')
print("💾 Model saved as: ml_model/color_comfort_model.pkl")
