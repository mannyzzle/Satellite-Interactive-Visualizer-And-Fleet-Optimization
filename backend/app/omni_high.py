import requests
import datetime

# Set a time range where data are known to exist.
start_dt = datetime.datetime(2024, 1, 1)  # Adjust as needed
end_dt   = datetime.datetime(2025, 3, 8)

# Format the time strings in ISO format with a 'Z' suffix.
time_min = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
time_max = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

# Use a minimal set of parameters that are definitely supported.
parameters = "Time,BX_GSE,BY_GSE,BZ_GSE,flow_speed,proton_density,T"

url = (
    f"https://cdaweb.gsfc.nasa.gov/hapi/data?"
    f"id=OMNI_HRO2_1MIN&parameters={requests.utils.quote(parameters)}"
    f"&time.min={time_min}&time.max={time_max}&format=csv"
)

print("Requesting URL:")
print(url)

response = requests.get(url)
response.raise_for_status()  # Raises an HTTPError for bad responses

# Save to a file
filename = "OMNI_HRO2_1MIN_minimal.csv"
with open(filename, "wb") as f:
    f.write(response.content)

print(f"Data saved to {filename}")
