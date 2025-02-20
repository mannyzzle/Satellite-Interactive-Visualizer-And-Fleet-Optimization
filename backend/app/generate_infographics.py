# backend/app/generate_infographics.py

import os
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from matplotlib.patches import Patch

# Use a font that's installed (Liberation Sans is included in fonts-liberation)
plt.rcParams["font.family"] = "Liberation Sans"
plt.style.use("dark_background")

# If you prefer a relative path in GH Actions, set INFOGRAPHICS_DIR = "backend/infographics"
# If you do generate images in Docker, you might want "/app/backend/infographics"
INFOGRAPHICS_DIR = "backend/infographics"  # ✅ Use a relative path

# ✅ Automatically create directory if missing (no fail-fast)
os.makedirs(INFOGRAPHICS_DIR, exist_ok=True)
print(f"✅ Infographics will be saved in: {INFOGRAPHICS_DIR}")

def get_sqlalchemy_engine():
    """
    Creates a SQLAlchemy database connection engine using env vars.
    """
    DB_USER = os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME")

    db_url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    return create_engine(db_url)




def fetch_clean_satellite_data(filter_condition=None):
    """
    Fetches satellite data from the DB, cleans numeric/categorical columns.
    """
    engine = get_sqlalchemy_engine()

    query = """
    SELECT orbit_type, velocity, perigee, apogee, eccentricity, bstar,
           inclination, mean_motion, purpose, country, launch_date,
           launch_site, semi_major_axis, period
    FROM satellites
    """
    if filter_condition:
        query += f" WHERE {filter_condition}"

    df = pd.read_sql(query, engine)

    if df.empty:
        print(f"⚠️ No data found for filter: {filter_condition}")
        return df

    print("✅ Raw satellite data fetched successfully!")

    # Convert to numeric, ignoring errors
    numeric_columns = [
        "velocity", "perigee", "apogee", "eccentricity",
        "bstar", "inclination", "mean_motion", "semi_major_axis"
    ]
    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Fill missing numeric
    df = df.fillna({
        "velocity": df["velocity"].median(),
        "perigee": 500,
        "apogee": 2000,
        "eccentricity": 0,
        "bstar": 0,
        "inclination": df["inclination"].median(),
        "mean_motion": df["mean_motion"].median(),
        "semi_major_axis": df["semi_major_axis"].median() if "semi_major_axis" in df.columns else np.nan
    })

    # Fill missing categorical
    df = df.fillna({
        "orbit_type": "Unknown",
        "purpose": "Unknown/Other",
        "country": "Undisclosed",
        "launch_site": "Unknown"
    })

    # Convert launch_date
    df["launch_date"] = pd.to_datetime(df["launch_date"], errors="coerce")
    df.dropna(subset=["launch_date"], inplace=True)
    df["launch_year"] = df["launch_date"].dt.year

    return df





# ✅ Function to Remove Outliers
def remove_outliers(df, column):
    """Removes outliers using IQR method."""
    if column not in df.columns:
        return df
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR
    return df[(df[column] >= lower_bound) & (df[column] <= upper_bound)]





# ✅ Function to Generate Infographics
def generate_infographics(filter_name, filter_condition=None):
    df = fetch_clean_satellite_data(filter_condition)
    if df.empty:
        print(f"⚠️ No data found for {filter_name}")
        return
    
    # ✅ Standardize File Names for API
    safe_filter_name = filter_name.replace(" ", "_").replace("(", "").replace(")", "")


        # Function to ensure old files are deleted before saving new ones
    def save_and_overwrite(fig, file_path):
        if os.path.exists(file_path):
            os.remove(file_path)
        fig.savefig(file_path)
        plt.close(fig)

    ## 🛰️ 1. Orbit Type Distribution (Bar Chart)
    fig = plt.figure(figsize=(8, 6))
    sns.countplot(y=df["orbit_type"], order=df["orbit_type"].value_counts().index, hue=df["orbit_type"], palette="Blues_r", legend=False)
    plt.title(f"Orbit Distribution by Type ({filter_name})", fontsize=14, color="white")
    plt.ylabel("Satellite Orbit Type", fontsize=12, color="white")
    plt.xlabel("Number of Satellites", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_orbit_distribution.png")

    ## 🚀 2. Velocity Distribution (Histogram) - Outliers Removed
    df_filtered = remove_outliers(df, "velocity")
    fig = plt.figure(figsize=(8, 6))
    sns.histplot(df_filtered["velocity"], bins=20, kde=True, color="cyan")
    plt.title(f"Velocity Distribution of Satellites ({filter_name})", fontsize=14, color="white")
    plt.xlabel("Orbital Velocity (km/s)", fontsize=12, color="white")
    plt.ylabel("Number of Satellites", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.axvline(df_filtered["velocity"].median(), color='red', linestyle="--", label="Median Velocity")
    plt.legend()
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_velocity_distribution.png")

    ## 📍 3. Perigee vs. Apogee Scatter Plot - Outliers Removed
    df_filtered = remove_outliers(df, "perigee")
    df_filtered = remove_outliers(df_filtered, "apogee")
    fig = plt.figure(figsize=(8, 6))
    sns.scatterplot(x=df_filtered["perigee"], y=df_filtered["apogee"], alpha=0.6, color="lightblue")
    plt.title(f"Comparison of Perigee & Apogee Heights ({filter_name})", fontsize=14, color="white")
    plt.xlabel("Perigee (Closest Approach, km)", fontsize=12, color="white")
    plt.ylabel("Apogee (Farthest Distance, km)", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_perigee_apogee.png")

    ## 🔍 4. Satellite Purpose Breakdown (Pie Chart)
    fig = plt.figure(figsize=(8, 6))
    purpose_counts = df["purpose"].value_counts()
    plt.pie(purpose_counts, labels=purpose_counts.index, autopct='%1.1f%%', colors=sns.color_palette("Blues_r"))
    plt.title(f"Satellite Purposes in Space ({filter_name})", fontsize=14, color="white")
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_purpose_breakdown.png")

    ## 🌍 5. Top 10 Countries Launching Satellites (Bar Chart)
    fig = plt.figure(figsize=(8, 6))
    sns.countplot(y=df["country"], order=df["country"].value_counts().index[:10], hue=df["country"], palette="Blues_r", legend=False)
    plt.title(f"Top 10 Countries in Satellite Deployment ({filter_name})", fontsize=14, color="white")
    plt.ylabel("Country", fontsize=12, color="white")
    plt.xlabel("Number of Satellites Launched", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_country_distribution.png")

    ## ⏳ 6. Cumulative Satellite Launches Over Time
    df["launch_year"] = pd.to_datetime(df["launch_date"], errors="coerce").dt.year
    launch_trend = df["launch_year"].value_counts().sort_index().cumsum()
    fig = plt.figure(figsize=(8, 6))
    sns.lineplot(x=launch_trend.index, y=launch_trend.values, marker="o", color="cyan")
    plt.title(f"Global Satellite Launch Trends ({filter_name})", fontsize=14, color="white")
    plt.xlabel("Year", fontsize=12, color="white")
    plt.ylabel("Total Satellites Launched", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_cumulative_launch_trend.png")

    ## 🔄 7. Orbital Period vs. Mean Motion (Scatter Plot) - Outliers Removed
    df_filtered = remove_outliers(df, "period")
    df_filtered = remove_outliers(df_filtered, "mean_motion")
    fig = plt.figure(figsize=(8, 6))
    sns.scatterplot(x=df_filtered["period"], y=df_filtered["mean_motion"], alpha=0.6, color="orange")
    plt.title(f"Orbital Period vs. Revolutions Per Day ({filter_name})", fontsize=14, color="white")
    plt.xlabel("Orbital Period (minutes)", fontsize=12, color="white")
    plt.ylabel("Revolutions per Day", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_orbital_period_vs_mean_motion.png")


    ## 8️⃣. Inclination vs. Mean Motion (Scatter Plot) - Outliers Removed
    df_filtered = remove_outliers(df, "inclination")
    df_filtered = remove_outliers(df_filtered, "mean_motion")
    fig = plt.figure(figsize=(8, 6))
    sns.scatterplot(x=df_filtered["inclination"], y=df_filtered["mean_motion"], alpha=0.6, color="green")
    plt.title(f"Inclination vs. Mean Motion ({filter_name})", fontsize=14, color="white")
    plt.xlabel("Inclination (degrees)", fontsize=12, color="white")
    plt.ylabel("Revolutions per Day", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_inclination_mean_motion.png")



    ## 🔥 9. Drag Effects on Satellites (Bubble Chart) - Keeps Negative B*
    df_filtered = remove_outliers(df, "bstar")
    df_filtered = remove_outliers(df_filtered, "apogee")
    fig = plt.figure(figsize=(8, 6))
    colors = ["red" if b < 0 else "yellow" if b > 0 else "blue" for b in df_filtered["bstar"]]
    sizes = [60 if b == 0 else 40 for b in df_filtered["bstar"]]
    plt.scatter(df_filtered["bstar"], df_filtered["apogee"], c=colors, alpha=0.6, s=sizes)
    plt.xscale("symlog", linthresh=1e-7)
    plt.yscale("log")
    plt.title(f"Drag Effects on Satellite Orbits ({filter_name})", fontsize=14, color="white")
    plt.xlabel("Atmospheric Drag (B* Term, symlog scale)", fontsize=12, color="white")
    plt.ylabel("Maximum Altitude (km, log scale)", fontsize=12, color="white")
    legend_elements = [
        Patch(facecolor="red", edgecolor="black", label="Negative Drag (B* < 0)"),
        Patch(facecolor="yellow", edgecolor="black", label="Positive Drag (B* > 0)"),
        Patch(facecolor="blue", edgecolor="black", label="No Drag (B* = 0)")
    ]
    plt.legend(handles=legend_elements, loc="upper left", fontsize=10)
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_bstar_altitude.png")


    ## 🏆 10. Most Frequent Satellite Launch Sites (Bar Chart)
    fig = plt.figure(figsize=(8, 6))
    launch_sites = df["launch_site"].value_counts()[:10]
    sns.barplot(y=launch_sites.index, x=launch_sites.values, hue=launch_sites.index, palette="Blues_r", legend=False)
    plt.title(f"Top 10 Satellite Launch Sites ({filter_name})", fontsize=14, color="white")
    plt.ylabel("Launch Site", fontsize=12, color="white")
    plt.xlabel("Number of Launches", fontsize=12, color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    save_and_overwrite(fig, f"{INFOGRAPHICS_DIR}/{safe_filter_name}_launch_sites.png")




# ✅ Full list of filters matching the UI
filters = {
    "All Satellites": None,  
    "LEO": "orbit_type = 'LEO'",
    "MEO": "orbit_type = 'MEO'",
    "GEO": "orbit_type = 'GEO'",
    "HEO": "orbit_type = 'HEO'",

    # 🚀 Velocity & Orbital Filters
    "High Velocity": "velocity > 7.8",
    "Low Velocity": "velocity <= 7.8",
    "Perigee < 500 km": "perigee < 500",
    "Apogee > 35,000 km": "apogee > 35000",
    "Eccentricity > 0.1": "eccentricity > 0.1",
    "B* Drag Term > 0.0001": "bstar > 0.0001",

    # 🛰️ Satellite Purpose
    "Communications": "purpose = 'Communications'",
    "Navigation": "purpose = 'Navigation'",
    "Military": "purpose = 'Military/Reconnaissance'",
    "Weather": "purpose = 'Weather Monitoring'",
    "Earth Observation": "purpose = 'Earth Observation'",
    "Science": "purpose = 'Scientific Research'",
    "Human Spaceflight": "purpose = 'Human Spaceflight'",
    "Technology Demo": "purpose = 'Technology Demonstration'",

    # 🚀 Launch & Decay Filters
    "Recent Launches": "launch_date > NOW() - INTERVAL '30 days'",

    # 📅 Dynamic Filters (Launch Year & Country)
}
