import requests
import json

# URLs for TLE datasets
TLE_DATASETS = {
    "active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    "starlink": "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
    "gps": "https://celestrak.com/NORAD/elements/gps-ops.txt",
    "weather": "https://celestrak.com/NORAD/elements/weather.txt"
}

def fetch_tle_data():
    """
    Fetches TLE data from CelesTrak and parses it into structured format.
    """
    all_satellites = []
    for category, url in TLE_DATASETS.items():
        response = requests.get(url)
        if response.status_code == 200:
            tle_data = response.text.strip().splitlines()
            for i in range(0, len(tle_data) - 2, 3):
                satellite = {
                    "category": category,
                    "name": tle_data[i].strip(),
                    "line1": tle_data[i + 1].strip(),
                    "line2": tle_data[i + 2].strip()
                }
                all_satellites.append(satellite)
        else:
            print(f"Failed to fetch data for category: {category} (Status Code: {response.status_code})")
    return all_satellites

def save_to_file(satellites, filename="data/satellites.json"):
    """
    Saves satellite data to a local JSON file.
    """
    with open(filename, "w") as file:
        json.dump(satellites, file, indent=2)
    print(f"Saved {len(satellites)} satellites to {filename}")

if __name__ == "__main__":
    satellites = fetch_tle_data()
    save_to_file(satellites)