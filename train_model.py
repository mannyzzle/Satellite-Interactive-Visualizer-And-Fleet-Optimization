import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, accuracy_score
from tqdm import tqdm
import joblib
import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection and data fetching
def fetch_data():
    print("Connecting to the database...")
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )
    
    query = """
    SELECT inclination, eccentricity, period, perigee, apogee, category
    FROM satellites
    """
    print("Fetching satellite data...")
    data = pd.read_sql_query(query, conn)
    conn.close()
    print("Data fetched successfully!")
    return data

# Preprocessing
def preprocess_data(data):
    print("Preprocessing data...")
    scaler = StandardScaler()
    le = LabelEncoder()

    # Encode target variable
    data['category'] = le.fit_transform(data['category'])

    # Normalize features
    X = scaler.fit_transform(data.drop(columns=['category']))
    y = data['category']

    return X, y, scaler, le

# Model training with loading bar
def train_model(X, y):
    print("Training the model...")
    progress_bar = tqdm(total=100, desc="Training Progress", ncols=100)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Model and hyperparameter tuning
    param_grid = {
        'n_estimators': [50, 100, 150],
        'max_depth': [None, 10, 20],
        'min_samples_split': [2, 5]
    }
    rf = RandomForestClassifier(random_state=42)

    grid_search = GridSearchCV(estimator=rf, param_grid=param_grid, cv=3, verbose=1)
    grid_search.fit(X_train, y_train)

    progress_bar.update(50)  # Simulate progress halfway through

    # Best model evaluation
    best_model = grid_search.best_estimator_
    y_pred = best_model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"\nModel Accuracy: {accuracy:.2f}")
    print("Classification Report:")
    print(classification_report(y_test, y_pred))

    progress_bar.update(50)  # Complete progress bar
    progress_bar.close()

    return best_model

# Save model
def save_model(model, scaler, label_encoder):
    print("Saving the model and preprocessors...")
    joblib.dump(model, 'model.pkl')
    joblib.dump(scaler, 'scaler.pkl')
    joblib.dump(label_encoder, 'label_encoder.pkl')
    print("Model and preprocessors saved!")

# Main function
if __name__ == "__main__":
    data = fetch_data()
    X, y, scaler, le = preprocess_data(data)
    model = train_model(X, y)
    save_model(model, scaler, le)
