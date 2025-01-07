# Use an official Python image as a starting point
FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create a workspace directory
WORKDIR /workspace

# Copy requirements if you have them
# COPY requirements.txt requirements.txt
# RUN pip install -r requirements.txt

# Expose port for Flask or FastAPI if needed
EXPOSE 5000

# Default command (optional, devcontainer.json can override)
CMD [ "bash" ]
