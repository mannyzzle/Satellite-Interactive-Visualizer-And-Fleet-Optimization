import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm
import joblib

# Load the cleaned data
data = pd.read_csv("cleaned_satellites.csv")

# Features and target
X = data[['inclination', 'eccentricity', 'perigee', 'apogee']]
y = data['period']

# Split the data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

# Normalize the features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Train a regression model with a loading bar
print("Training the model...")
model = RandomForestRegressor(n_estimators=100, random_state=42)
for i in tqdm(range(100), desc="Training Progress"):
    model.fit(X_train_scaled, y_train)

# Evaluate the model
print("Evaluating the model...")
y_pred = model.predict(X_test_scaled)
mae = mean_absolute_error(y_test, y_pred)
mse = mean_squared_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"Mean Absolute Error (MAE): {mae}")
print(f"Mean Squared Error (MSE): {mse}")
print(f"R² Score: {r2}")

# Save the model and scaler
joblib.dump(model, "satellite_period_predictor.pkl")
joblib.dump(scaler, "feature_scaler.pkl")
print("Model and scaler saved!")
