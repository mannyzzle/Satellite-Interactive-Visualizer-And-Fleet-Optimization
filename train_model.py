import psycopg2
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler
from imblearn.over_sampling import SMOTE
from tqdm import tqdm
import joblib
from dotenv import load_dotenv
import os
import time

# Load environment variables
load_dotenv()

# Database credentials
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

def fetch_data():
    """
    Fetch satellite data from the PostgreSQL database.
    """
    print("Fetching data from the database...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME
    )
    query = """
        SELECT category, satellite_name, tle_line1, tle_line2
        FROM satellites;
    """
    data = pd.read_sql_query(query, conn)
    conn.close()
    return data

def preprocess_data(data):
    """
    Preprocess satellite data for machine learning.
    """
    print("Preprocessing data...")
    # Simulate a progress bar for preprocessing
    for _ in tqdm(range(100), desc="Processing data"):
        time.sleep(0.01)

    # Extract TLE line lengths as features
    data['tle_length'] = data['tle_line1'].str.len() + data['tle_line2'].str.len()

    # Add binary target variable (is_active)
    data['is_active'] = (data['category'] == 'active').astype(int)

    # Normalize features
    X = data[['tle_length']]
    y = data['is_active']
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    return train_test_split(X_scaled, y, test_size=0.2, random_state=42)

def train_and_tune_model(X_train, y_train):
    """
    Train and tune the RandomForestClassifier using GridSearchCV.
    """
    print("Training and tuning the model...")
    param_grid = {
        'n_estimators': [50, 100, 200],
        'max_depth': [None, 10, 20],
        'min_samples_split': [2, 5, 10]
    }

    # Simulate a loading bar for training preparation
    for _ in tqdm(range(50), desc="Preparing for training"):
        time.sleep(0.01)

    # Train model with grid search
    model = GridSearchCV(RandomForestClassifier(random_state=42), param_grid, cv=3, n_jobs=-1)
    model.fit(X_train, y_train)

    print("Best hyperparameters:", model.best_params_)
    return model.best_estimator_

if __name__ == "__main__":
    # Step 1: Fetch data
    data = fetch_data()

    # Step 2: Preprocess data
    X_train, X_test, y_train, y_test = preprocess_data(data)

    # Step 3: Handle class imbalance
    print("Balancing data using SMOTE...")
    smote = SMOTE(random_state=42)
    X_train_balanced, y_train_balanced = smote.fit_resample(X_train, y_train)

    # Step 4: Train and tune model
    model = train_and_tune_model(X_train_balanced, y_train_balanced)

    # Step 5: Evaluate model
    print("Evaluating the model...")
    y_pred = model.predict(X_test)
    print("Accuracy:", accuracy_score(y_test, y_pred))
    print("Classification Report:")
    print(classification_report(y_test, y_pred))

    # Step 6: Save the model
    print("Saving the model to model.pkl...")
    joblib.dump(model, 'model.pkl')
    print("Model training complete and saved!")
