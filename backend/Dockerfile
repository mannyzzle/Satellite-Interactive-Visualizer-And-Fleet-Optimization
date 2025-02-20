FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install fonts-liberation + fontconfig so matplotlib can find them
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Force cache busting by copying requirements first
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# THEN copy the rest of the application
COPY . /app

# Ensure the infographics directory exists & clear old files before running
RUN mkdir -p /app/backend/infographics && chmod -R 777 /app/backend/infographics

# ✅ Ensure stale images are cleared & FastAPI always starts
CMD bash -c "rm -rf /app/backend/infographics/* || echo 'No old images to clear' && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
