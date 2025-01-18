import os
import psycopg2
import pandas as pd
import numpy as np
from scipy.stats import zscore
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

# Connect to the database
try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    print("Connected to the database!")
except Exception as e:
    print(f"Error connecting to the database: {e}")
    exit()

# Fetch the data (including 'category')
query = "SELECT category, inclination, eccentricity, period, perigee, apogee FROM satellites"
try:
    data = pd.read_sql_query(query, conn)
    print("Data fetched successfully!")
except Exception as e:
    print(f"Error fetching data: {e}")
    exit()

# Detecting outliers using IQR method
def detect_outliers_iqr(df, columns):
    outliers = {}
    for col in columns:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        outliers[col] = df[(df[col] < lower_bound) | (df[col] > upper_bound)].shape[0]
    return outliers

# Detecting outliers using Z-Score method
def detect_outliers_zscore(df, columns):
    outliers = {}
    for col in columns:
        z_scores = zscore(df[col])
        outliers[col] = (np.abs(z_scores) > 3).sum()
    return outliers

numerical_features = ['inclination', 'eccentricity', 'period', 'perigee', 'apogee']

print("Detecting outliers using IQR method...")
iqr_outliers = detect_outliers_iqr(data, numerical_features)
print("Number of outliers (IQR):", iqr_outliers)

print("Detecting outliers using Z-Score method...")
zscore_outliers = detect_outliers_zscore(data, numerical_features)
print("Number of outliers (Z-Score):", zscore_outliers)

# Handling outliers (optional)
def handle_outliers(df, method="remove"):
    if method == "remove":
        for col in numerical_features:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            df = df[(df[col] >= lower_bound) & (df[col] <= upper_bound)]
    elif method == "cap":
        for col in numerical_features:
            Q1 = df[col].quantile(0.25)
            Q3 = df[col].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            df[col] = np.where(df[col] < lower_bound, lower_bound, df[col])
            df[col] = np.where(df[col] > upper_bound, upper_bound, df[col])
    return df

# Example: Remove outliers
print("Handling outliers by removing them...")
cleaned_data = handle_outliers(data, method="remove")
print(f"Data shape after removing outliers: {cleaned_data.shape}")

# Save cleaned data to a new table or CSV
cleaned_data.to_csv("cleaned_satellites.csv", index=False)
print("Cleaned data saved to 'cleaned_satellites.csv'!")
