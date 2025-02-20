FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages for Matplotlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the requirements file first for Docker layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the rest of the repository AFTER installing dependencies
COPY . /app

# ✅ Ensure the infographics directory exists (inside container)
RUN mkdir -p /app/backend/infographics

# ✅ Mount this folder as a volume so images persist across builds
VOLUME ["/app/backend/infographics"]

# ✅ Start FastAPI application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
