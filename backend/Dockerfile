FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages for Matplotlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the requirements first for Docker layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the rest of the repository AFTER installing dependencies
COPY . /app

# ✅ Ensure infographics directory exists and has correct permissions
RUN mkdir -p /app/backend/infographics && chmod -R 777 /app/backend/infographics

# ✅ No need to copy infographics from local, they will be generated dynamically

# Start FastAPI application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
