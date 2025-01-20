import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sqlalchemy import create_engine
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection
print("Connecting to the database...")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_host = os.getenv("DB_HOST")
db_name = os.getenv("DB_NAME")

connection_string = f"postgresql://{db_user}:{db_password}@{db_host}/{db_name}"
engine = create_engine(connection_string)

# Fetching data
print("Fetching satellite data...")
query = """
SELECT id, category, inclination, eccentricity, period, perigee, apogee
FROM satellites;
"""
try:
    data = pd.read_sql_query(query, engine)
    print("Data fetched successfully!")
except Exception as e:
    print(f"Error fetching data: {e}")
    exit()

# EDA

# Display first few rows
print("Displaying the first few rows of the dataset:")
print(data.head())

# Summary statistics
print("\nSummary statistics:")
print(data.describe())

# Data distributions
print("\nPlotting data distributions...")
plt.figure(figsize=(10, 6))
sns.histplot(data['inclination'], bins=30, kde=True)
plt.title("Distribution of Satellite Inclinations")
plt.xlabel("Inclination (degrees)")
plt.ylabel("Frequency")
plt.savefig("plots/inclination_distribution.png")
plt.close()

plt.figure(figsize=(10, 6))
sns.histplot(data['eccentricity'], bins=30, kde=True)
plt.title("Distribution of Satellite Eccentricities")
plt.xlabel("Eccentricity")
plt.ylabel("Frequency")
plt.savefig("plots/eccentricity_distribution.png")
plt.close()

# Correlation heatmap
print("\nPlotting correlation heatmap...")
correlation_matrix = data[['inclination', 'eccentricity', 'period', 'perigee', 'apogee']].corr()
plt.figure(figsize=(8, 6))
sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm', fmt='.2f')
plt.title("Feature Correlation Heatmap")
plt.savefig("plots/correlation_heatmap.png")
plt.close()

# Scatter plots
print("\nPlotting scatter plots...")
plt.figure(figsize=(10, 6))
sns.scatterplot(data=data, x='period', y='eccentricity', hue='category')
plt.title("Eccentricity vs. Period")
plt.xlabel("Period")
plt.ylabel("Eccentricity")
plt.legend()
plt.savefig("plots/eccentricity_vs_period.png")
plt.close()

plt.figure(figsize=(10, 6))
sns.scatterplot(data=data, x='perigee', y='apogee', hue='category')
plt.title("Perigee vs. Apogee")
plt.xlabel("Perigee")
plt.ylabel("Apogee")
plt.legend()
plt.savefig("plots/perigee_vs_apogee.png")
plt.close()

# Count of satellites by category
print("\nCounting satellites by category...")
category_counts = data['category'].value_counts()
plt.figure(figsize=(10, 6))
sns.barplot(x=category_counts.index, y=category_counts.values)
plt.title("Satellite Count by Category")
plt.xlabel("Category")
plt.ylabel("Count")
plt.xticks(rotation=45)
plt.savefig("plots/satellite_count_by_category.png")
plt.close()

print("\nEDA complete! Plots saved in the 'plots' directory.")


import joblib

# Load the model and scaler
model = joblib.load("satellite_period_predictor.pkl")
scaler = joblib.load("feature_scaler.pkl")

# Load the cleaned data
data = pd.read_csv("cleaned_satellites.csv")

# Prepare features and target
X = data[['inclination', 'eccentricity', 'perigee', 'apogee']]
y_actual = data['period']

# Scale the features
X_scaled = scaler.transform(X)

# Predict the period values
y_pred = model.predict(X_scaled)

# Plot predicted vs. actual values
plt.figure(figsize=(10, 6))
plt.scatter(y_actual, y_pred, alpha=0.6, edgecolor='k', label='Predicted vs Actual')
plt.plot([y_actual.min(), y_actual.max()], 
         [y_actual.min(), y_actual.max()], 
         color='red', linestyle='--', linewidth=2, label='Ideal Fit (y=x)')
plt.title("Predicted vs. Actual Period Values")
plt.xlabel("Actual Period Values")
plt.ylabel("Predicted Period Values")
plt.legend()
plt.grid(True)
plt.savefig("plots/predicted_periods.png")
plt.show()


# Extract feature importance from the trained model
feature_importances = model.feature_importances_

# Define feature names
feature_names = X.columns

# Create a DataFrame for visualization
importance_df = pd.DataFrame({
    'Feature': feature_names,
    'Importance': feature_importances
}).sort_values(by='Importance', ascending=False)

# Print the feature importance
print(importance_df)

# Plot the feature importances
plt.figure(figsize=(8, 6))
plt.barh(importance_df['Feature'], importance_df['Importance'], color='skyblue')
plt.xlabel('Feature Importance')
plt.ylabel('Features')
plt.title('Feature Importances in Random Forest Model')
plt.gca().invert_yaxis()  # To display the most important feature on top
plt.savefig("plots/periods_predicted_features.png")
plt.show()

import psycopg2
import pandas as pd
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Connect to the database
def connect_to_db():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )
    return conn

# Fetch satellite data and calculate counts
def fetch_and_analyze_data():
    conn = connect_to_db()
    query = "SELECT category, orbit_type FROM satellites"
    
    # Fetch data from the database
    data = pd.read_sql_query(query, conn)
    conn.close()
    
    # Group by category and orbit type
    category_counts = data['category'].value_counts()
    orbit_type_counts = data['orbit_type'].value_counts()
    category_orbit_counts = data.groupby(['category', 'orbit_type']).size().reset_index(name='count')

    # Print summaries
    print("\nSatellite Count by Category:")
    print(category_counts)

    print("\nSatellite Count by Orbit Type:")
    print(orbit_type_counts)

    print("\nSatellite Count by Category and Orbit Type:")
    print(category_orbit_counts)

if __name__ == "__main__":
    fetch_and_analyze_data()
