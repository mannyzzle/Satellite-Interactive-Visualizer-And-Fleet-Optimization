FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the requirements file first to leverage Docker layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the rest of the repository AFTER installing dependencies
COPY . /app

# Ensure the infographics directory exists in the container
RUN mkdir -p /app/backend/infographics && chmod -R 777 /app/backend/infographics

# Ensure images directory exists (but DON'T copy it if empty)
RUN if [ ! -d "/app/backend/infographics" ]; then mkdir -p /app/backend/infographics; fi

# Start the FastAPI application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
