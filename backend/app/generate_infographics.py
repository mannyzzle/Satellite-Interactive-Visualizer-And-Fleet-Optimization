import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
import psycopg2
import os
from datetime import datetime
from database import get_db_connection

# ✅ Dark Mode Theme with Dark Blue Background
plt.style.use("dark_background")

# ✅ Ensure directory exists for infographics
INFOGRAPHICS_DIR = "backend/infographics"
os.makedirs(INFOGRAPHICS_DIR, exist_ok=True)


# ✅ Function to Fetch & Clean Data
def fetch_clean_satellite_data(filter_condition=None):
    """
    Fetches satellite data & handles missing values.
    """
    conn = get_db_connection()
    query = f"""
    SELECT orbit_type, velocity, perigee, apogee, eccentricity, bstar, inclination, 
           mean_motion, purpose, country, launch_date, decay_date, object_type
    FROM satellites
    """
    if filter_condition:
        query += f" WHERE {filter_condition}"

    df = pd.read_sql(query, conn)
    conn.close()

    # ✅ Fill Missing Numeric Values
    df["velocity"].fillna(df["velocity"].median(), inplace=True)
    df["perigee"].fillna(500, inplace=True)  # Default safe perigee
    df["apogee"].fillna(2000, inplace=True)  # Default high altitude
    df["eccentricity"].fillna(0, inplace=True)  # Circular orbit assumption
    df["bstar"].fillna(0, inplace=True)  # No drag assumption
    df["inclination"].fillna(df["inclination"].median(), inplace=True)
    df["mean_motion"].fillna(df["mean_motion"].median(), inplace=True)

    # ✅ Fill Missing Categorical Values
    df["orbit_type"].fillna("Unknown", inplace=True)
    df["purpose"].fillna("Unknown/Other", inplace=True)
    df["country"].fillna("Undisclosed", inplace=True)

    return df


# ✅ Generate Infographics
def generate_infographics(filter_name, filter_condition=None):
    df = fetch_clean_satellite_data(filter_condition)
    if df.empty:
        print(f"⚠️ No data found for {filter_name}")
        return

    ## 🛰️ 1. Orbit Type Distribution (Bar Chart)
    plt.figure(figsize=(8, 6))
    sns.countplot(y=df["orbit_type"], order=df["orbit_type"].value_counts().index, palette="Blues_r")
    plt.title(f"🛰️ Orbit Distribution ({filter_name})", color="white")
    plt.ylabel("Orbit Type", color="white")
    plt.xlabel("Number of Satellites", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_orbit_distribution.png")
    plt.close()

    ## 🚀 2. Velocity Distribution (Histogram)
    plt.figure(figsize=(8, 6))
    sns.histplot(df["velocity"], bins=20, kde=True, color="cyan")
    plt.title(f"🚀 Velocity Distribution ({filter_name})", color="white")
    plt.xlabel("Velocity (km/s)", color="white")
    plt.ylabel("Satellite Count", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_velocity_distribution.png")
    plt.close()

    ## 📍 3. Perigee vs. Apogee Scatter Plot
    plt.figure(figsize=(8, 6))
    sns.scatterplot(x=df["perigee"], y=df["apogee"], alpha=0.6, color="lightblue")
    plt.title(f"📍 Perigee vs. Apogee ({filter_name})", color="white")
    plt.xlabel("Perigee (km)", color="white")
    plt.ylabel("Apogee (km)", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_perigee_apogee.png")
    plt.close()

    ## 🔍 4. Satellite Purpose Breakdown (Pie Chart)
    plt.figure(figsize=(8, 6))
    purpose_counts = df["purpose"].value_counts()
    plt.pie(purpose_counts, labels=purpose_counts.index, autopct='%1.1f%%', colors=sns.color_palette("Blues_r"))
    plt.title(f"🔍 Satellite Purpose Breakdown ({filter_name})", color="white")
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_purpose_breakdown.png")
    plt.close()

    ## 🌍 5. Country-Based Satellite Distribution (Bar Chart)
    plt.figure(figsize=(8, 6))
    sns.countplot(y=df["country"], order=df["country"].value_counts().index[:10], palette="Blues_r")
    plt.title(f"🌍 Top 10 Countries Launching Satellites ({filter_name})", color="white")
    plt.ylabel("Country", color="white")
    plt.xlabel("Number of Satellites", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_country_distribution.png")
    plt.close()

    ## 📈 6. Inclination vs. Altitude Density (Heatmap)
    plt.figure(figsize=(8, 6))
    sns.kdeplot(x=df["inclination"], y=df["apogee"], cmap="Blues", fill=True)
    plt.title(f"📈 Inclination vs. Altitude Density ({filter_name})", color="white")
    plt.xlabel("Inclination (°)", color="white")
    plt.ylabel("Apogee (km)", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_inclination_altitude.png")
    plt.close()

    ## 💨 7. Mean Motion vs. Drag Influence (Bubble Chart)
    plt.figure(figsize=(8, 6))
    plt.scatter(df["mean_motion"], df["bstar"], alpha=0.6, color="yellow", s=40)
    plt.xscale("log")
    plt.yscale("log")
    plt.title(f"💨 Mean Motion vs. Drag Influence ({filter_name})", color="white")
    plt.xlabel("Mean Motion (log scale)", color="white")
    plt.ylabel("B* Drag Term (log scale)", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_meanmotion_drag.png")
    plt.close()

    ## ⏳ 8. Launch Trend Over Time (Line Chart)
    df["launch_year"] = pd.to_datetime(df["launch_date"]).dt.year
    launch_trend = df["launch_year"].value_counts().sort_index()
    plt.figure(figsize=(8, 6))
    sns.lineplot(x=launch_trend.index, y=launch_trend.values, marker="o", color="cyan")
    plt.title(f"⏳ Launch Trend Over Time ({filter_name})", color="white")
    plt.xlabel("Year", color="white")
    plt.ylabel("Number of Launches", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_launch_trend.png")
    plt.close()

    ## 📅 9. Satellite Longevity Projection (Survival Curve)
    df["lifetime"] = (pd.to_datetime(df["decay_date"]) - pd.to_datetime(df["launch_date"])).dt.days
    plt.figure(figsize=(8, 6))
    sns.histplot(df["lifetime"].dropna(), bins=20, kde=True, color="lightblue")
    plt.title(f"📅 Satellite Longevity Projection ({filter_name})", color="white")
    plt.xlabel("Lifetime (Days)", color="white")
    plt.ylabel("Satellite Count", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_satellite_lifetime.png")
    plt.close()

    ## 📅 10. Orbital Lifetime vs. Drag Effects
    df = df[df["lifetime"].notna() & df["bstar"].notna()]
    plt.figure(figsize=(10, 6))
    sns.scatterplot(x=df["bstar"], y=df["lifetime"], alpha=0.6, color="yellow")
    plt.xscale("log")
    plt.yscale("log")
    plt.title(f"📅 Orbital Lifetime vs. Drag Effects ({filter_name})", color="white")
    plt.xlabel("B* Drag Term (log scale)", color="white")
    plt.ylabel("Lifetime in Orbit (log scale)", color="white")
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(f"{INFOGRAPHICS_DIR}/{filter_name}_orbital_lifetime_drag.png")
    plt.close()

# ✅ Run for all filters
for filter_name, filter_condition in {
    "All Satellites": None, "LEO": "orbit_type = 'LEO'", "MEO": "orbit_type = 'MEO'", "GEO": "orbit_type = 'GEO'", "HEO": "orbit_type = 'HEO'",
}.items():
    generate_infographics(filter_name, filter_condition)
