import sys
import os

# Ensure Python can find the backend app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.tle_processor import fetch_tle_data

try:
    satellites = fetch_tle_data()
    print(f"✅ Fetched {len(satellites)} satellites.")
    print("🔍 Sample TLE data:", satellites[:3])  # Show first 3 entries
except Exception as e:
    print(f"❌ Error fetching TLE data: {e}")
