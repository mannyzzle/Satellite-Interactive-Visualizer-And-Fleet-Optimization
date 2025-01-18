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
