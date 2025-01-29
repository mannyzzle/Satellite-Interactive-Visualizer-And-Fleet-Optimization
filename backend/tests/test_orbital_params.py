import sys
import os

# Ensure the backend module can be found
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.tle_processor import compute_orbital_params

# Example TLE lines for testing
tle_line1 = "1 25544U 98067A   23028.71505935  .00016717  00000+0  10270-3 0  9009"
tle_line2 = "2 25544  51.6458 359.7975 0005650  89.5483  34.6206 15.50001033 98219"

try:
    params = compute_orbital_params(tle_line1, tle_line2)
    print("✅ Computed orbital parameters:")
    for key, value in params.items():
        print(f"  {key}: {value}")
except Exception as e:
    print(f"❌ Error computing orbital parameters: {e}")
