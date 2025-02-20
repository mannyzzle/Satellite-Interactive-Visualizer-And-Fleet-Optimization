import os
import io
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sqlalchemy import create_engine, Column, String, LargeBinary, DateTime, Integer
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
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

# ✅ Set up SQLAlchemy Engine for AWS PostgreSQL
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")

engine = create_engine(f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}")
Session = sessionmaker(bind=engine)
session = Session()

Base = declarative_base()

# ✅ Define the Infographics Table (matching your SQL schema)
class Infographic(Base):
    __tablename__ = "infographics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    filter_name = Column(String, nullable=False)
    graph_type = Column(String, nullable=False)
    image_data = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)


# ✅ Save Infographic to DB (matching your table structure)
def save_infographic_to_db(filter_name, graph_type, image_data):
    """
    Saves an infographic as a BLOB into AWS PostgreSQL.
    If the infographic exists, it updates the image.
    """
    existing_entry = session.query(Infographic).filter_by(filter_name=filter_name, graph_type=graph_type).first()
    if existing_entry:
        existing_entry.image_data = image_data
        existing_entry.created_at = datetime.utcnow()
    else:
        new_entry = Infographic(filter_name=filter_name, graph_type=graph_type, image_data=image_data)
        session.add(new_entry)

    session.commit()


# ✅ Fetch and Clean Satellite Data
def fetch_clean_satellite_data(filter_condition=None):
    """
    Fetches satellite data from AWS PostgreSQL and cleans it.
    """
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
    df.fillna({
        "velocity": df["velocity"].median(),
        "perigee": 500,
        "apogee": 2000,
        "eccentricity": 0,
        "bstar": 0,
        "inclination": df["inclination"].median(),
        "mean_motion": df["mean_motion"].median(),
        "semi_major_axis": df["semi_major_axis"].median() if "semi_major_axis" in df.columns else np.nan
    }, inplace=True)

    # Fill missing categorical
    df.fillna({
        "orbit_type": "Unknown",
        "purpose": "Unknown/Other",
        "country": "Undisclosed",
        "launch_site": "Unknown"
    }, inplace=True)

    # Convert launch_date
    df["launch_date"] = pd.to_datetime(df["launch_date"], errors="coerce")
    df.dropna(subset=["launch_date"], inplace=True)
    df["launch_year"] = df["launch_date"].dt.year

    return df


# ✅ Function to Remove Outliers
def remove_outliers(df, column):
    """Removes outliers using the IQR method."""
    if column not in df.columns:
        return df
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR
    return df[(df[column] >= lower_bound) & (df[column] <= upper_bound)]


# ✅ Function to Save and Overwrite Files
def save_and_overwrite(fig, file_path):
    """Ensures old files are deleted before saving new ones."""
    if os.path.exists(file_path):
        os.remove(file_path)
    fig.savefig(file_path)
    plt.close(fig)


# ✅ Save infographic as a BLOB in AWS PostgreSQL
def save_to_db(fig, filter_name, graph_type):
    """Converts Matplotlib figures to PNG bytes and saves to AWS PostgreSQL."""
    img_buffer = io.BytesIO()
    fig.savefig(img_buffer, format="png")
    img_buffer.seek(0)

    save_infographic_to_db(filter_name, graph_type, img_buffer.getvalue())
    plt.close(fig)


# ✅ Function to Generate & Store Infographics in AWS PostgreSQL
def generate_infographics(filter_name, filter_condition=None):
    df = fetch_clean_satellite_data(filter_condition)
    if df.empty:
        print(f"⚠️ No data found for {filter_name}")
        return

    # ✅ Standardize File Names for API
    safe_filter_name = filter_name.replace(" ", "_").replace("(", "").replace(")", "")

    ## 🛰️ 1. Orbit Type Distribution (Bar Chart)
    fig, ax = plt.subplots(figsize=(10, 6))
    orbit_counts = df["orbit_type"].value_counts()

    sns.barplot(
        y=orbit_counts.index,
        x=orbit_counts.values,
        palette="viridis",  # Uniform color scheme
        ax=ax
    )

    # Add text labels inside bars
    for i, v in enumerate(orbit_counts.values):
        ax.text(v + 2, i, f"{v}", color="white", va="center", fontsize=13, fontweight="bold")

    ax.set_xlabel("Number of Satellites", fontsize=14, color="white")
    ax.set_ylabel("Orbit Type", fontsize=14, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_orbit_distribution", "orbit_distribution")



    ## 🚀 2. Velocity Distribution (Histogram) - Outliers Removed
    df_filtered = remove_outliers(df, "velocity")
    fig, ax = plt.subplots(figsize=(11, 6))

    sns.histplot(df_filtered["velocity"], bins="auto", kde=True, color="cyan", alpha=0.8, ax=ax)
    sns.kdeplot(df_filtered["velocity"], color="red", linestyle="--", ax=ax)

    ax.axvline(df_filtered["velocity"].median(), color='yellow', linestyle="--", linewidth=2, label="Median Velocity")
    ax.set_xscale("log")  # Log scale for better clarity
    ax.legend()

    ax.set_xlabel("Orbital Velocity (km/s) (log scale)", fontsize=14, color="white")
    ax.set_ylabel("Number of Satellites", fontsize=14, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_velocity_distribution", "velocity_distribution")


    ## 📍 3. Perigee vs. Apogee Scatter Plot - Outliers Removed
    df_filtered = remove_outliers(df, "perigee")
    df_filtered = remove_outliers(df_filtered, "apogee")
    fig, ax = plt.subplots(figsize=(11, 7))

    sns.scatterplot(
        x=df_filtered["perigee"],
        y=df_filtered["apogee"],
        hue=df_filtered["orbit_type"],
        size=df_filtered["velocity"],  # Bubble size based on velocity
        sizes=(40, 300),
        palette="viridis",
        alpha=0.7,
        ax=ax
    )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Perigee (km, log scale)", fontsize=14, color="white")
    ax.set_ylabel("Apogee (km, log scale)", fontsize=14, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.legend(title="Orbit Type", loc="upper right")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_perigee_apogee", "perigee_apogee")


    ## 🔍 4. Satellite Purpose Breakdown (Pie Chart)
    fig, ax = plt.subplots(figsize=(9, 7))
    purpose_counts = df["purpose"].value_counts()

    wedges, texts, autotexts = ax.pie(
        purpose_counts,
        labels=purpose_counts.index,
        autopct='%1.1f%%',
        colors=sns.color_palette("viridis", len(purpose_counts)),
        startangle=140,
        wedgeprops={'edgecolor': 'black', 'linewidth': 1.5},
        pctdistance=0.85,
        explode=[0.1 if i == purpose_counts.idxmax() else 0 for i in purpose_counts.index]
    )

    center_circle = plt.Circle((0, 0), 0.70, fc='black')
    fig.gca().add_artist(center_circle)

    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_purpose_breakdown", "purpose_breakdown")






    ## 🌍 5. Top 10 Countries Launching Satellites (Bar Chart)
    fig, ax = plt.subplots(figsize=(10, 7))
    top_countries = df["country"].value_counts().head(10)

    sns.barplot(
        y=top_countries.index,
        x=top_countries.values,
        palette="viridis",
        ax=ax
    )

    # Add percentage labels inside bars
    total = top_countries.sum()
    for i, v in enumerate(top_countries.values):
        ax.text(v + 2, i, f"{(v / total) * 100:.1f}%", color="white", va="center", fontsize=13, fontweight="bold")

    ax.set_xlabel("Number of Satellites Launched", fontsize=14, color="white")
    ax.set_ylabel("Country", fontsize=14, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_country_distribution", "country_distribution")



    ## ⏳ 6. Cumulative Satellite Launches Over Time
    df["launch_year"] = pd.to_datetime(df["launch_date"], errors="coerce").dt.year
    df["launch_month"] = df["launch_date"].dt.month
    df["launch_day"] = df["launch_date"].dt.date

    is_single_year_filter = filter_name.startswith("Launch Year")
    is_recent_launch_filter = filter_name == "Recent Launches"

    fig, ax = plt.subplots(figsize=(10, 6))

    if is_recent_launch_filter:
        last_30_days = df[df["launch_date"] >= pd.Timestamp.now() - pd.DateOffset(days=30)]
        daily_launches = last_30_days.groupby("launch_day").size()

        sns.lineplot(x=daily_launches.index, y=daily_launches.values, marker="o", color="magenta", ax=ax)
        plt.xticks(rotation=45)
        ax.set_xlabel("Date", fontsize=12, color="white")
        ax.set_ylabel("Number of Satellites Launched", fontsize=12, color="white")

    elif is_single_year_filter:
        year = int(filter_name.split(" ")[2])
        df = df[df["launch_year"] == year]
        monthly_launches = df.groupby("launch_month").size()

        sns.lineplot(x=monthly_launches.index, y=monthly_launches.values, marker="o", color="cyan", ax=ax)
        plt.xticks(ticks=range(1, 13), labels=[
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ])
        ax.set_xlabel("Month", fontsize=12, color="white")
        ax.set_ylabel("Number of Satellites Launched", fontsize=12, color="white")

    else:
        launch_trend = df["launch_year"].value_counts().sort_index().cumsum()

        sns.lineplot(x=launch_trend.index, y=launch_trend.values, marker="o", color="cyan", ax=ax)
        ax.set_xlabel("Year", fontsize=12, color="white")
        ax.set_ylabel("Total Satellites Launched", fontsize=12, color="white")

    ax.grid(alpha=0.3)
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_cumulative_launch_trend", "cumulative_launch_trend")



    ## 🔄 7. Orbital Period vs. Mean Motion (Scatter Plot) - Outliers Removed
    df_filtered = remove_outliers(df, "period")
    df_filtered = remove_outliers(df, "mean_motion")

    fig, ax = plt.subplots(figsize=(8, 6))

    sns.scatterplot(
        x=df_filtered["period"],
        y=df_filtered["mean_motion"],
        hue=df_filtered["orbit_type"],
        size=df_filtered["period"],
        sizes=(30, 300),
        palette="viridis",
        alpha=0.7,
        ax=ax
    )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Orbital Period (minutes, log scale)", fontsize=12, color="white")
    ax.set_ylabel("Revolutions per Day (log scale)", fontsize=12, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.legend(title="Orbit Type", loc="upper right")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_orbital_period_vs_mean_motion", "orbital_period_vs_mean_motion")




    ## 8️⃣. Inclination vs. Mean Motion (Scatter Plot) - Outliers Removed
    df_filtered = remove_outliers(df, "inclination")
    df_filtered = remove_outliers(df_filtered, "mean_motion")

    fig, ax = plt.subplots(figsize=(8, 6))

    sns.scatterplot(
        x=df_filtered["inclination"],
        y=df_filtered["mean_motion"],
        hue=df_filtered["orbit_type"],
        size=df_filtered["inclination"],
        sizes=(30, 250),
        palette="viridis",
        alpha=0.7,
        ax=ax
    )

    ax.set_ylabel("Revolutions per Day (log scale)", fontsize=12, color="white")
    ax.set_xlabel("Inclination (degrees)", fontsize=12, color="white")
    ax.set_yscale("log")
    ax.grid(alpha=0.3, linestyle="--")
    plt.legend(title="Orbit Type", loc="upper right")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_inclination_mean_motion", "inclination_mean_motion")


    ## 🔥 9. Drag Effects on Satellites (Bubble Chart)
    df_filtered = remove_outliers(df, "bstar")
    df_filtered = remove_outliers(df, "apogee")
    fig, ax = plt.subplots(figsize=(11, 7))

    sns.scatterplot(
        x=df_filtered["bstar"],
        y=df_filtered["apogee"],
        hue=df_filtered["orbit_type"],
        size=df_filtered["apogee"],
        sizes=(30, 300),
        palette="viridis",
        alpha=0.6,
        ax=ax
    )

    ax.set_xscale("symlog", linthresh=1e-7)
    ax.set_yscale("log")
    ax.set_xlabel("Atmospheric Drag (B* Term, symlog scale)", fontsize=14, color="white")
    ax.set_ylabel("Maximum Altitude (km, log scale)", fontsize=14, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_bstar_altitude", "bstar_altitude")




    ## 🏆 10. Most Frequent Satellite Launch Sites (Bar Chart)
    fig, ax = plt.subplots(figsize=(9, 6))
    top_launch_sites = df["launch_site"].value_counts().head(10)

    sns.barplot(
        y=top_launch_sites.index,
        x=top_launch_sites.values,
        palette="viridis",
        ax=ax
    )

    # Add percentage labels inside bars
    total = top_launch_sites.sum()
    for i, v in enumerate(top_launch_sites.values):
        ax.text(v + 2, i, f"{(v / total) * 100:.1f}%", color="white", va="center", fontsize=13, fontweight="bold")

    ax.set_xlabel("Number of Launches", fontsize=12, color="white")
    ax.set_ylabel("Launch Site", fontsize=12, color="white")
    ax.grid(alpha=0.3, linestyle="--")
    plt.tight_layout()
    save_to_db(fig, f"{safe_filter_name}_launch_sites", "launch_sites")






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
