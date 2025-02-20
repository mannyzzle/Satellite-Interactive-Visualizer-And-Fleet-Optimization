FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install necessary packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire repository, ensuring images are included
COPY . /app

# Ensure the infographics directory exists
RUN mkdir -p /app/backend/infographics && chmod -R 777 /app/backend/infographics

# Ensure images are copied into the container
COPY backend/infographics/ /app/backend/infographics/

# Start the FastAPI application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
