FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# 1) Install necessary system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# 2) Set the working directory
WORKDIR /app

# 3) Copy the entire project
COPY . /app

# 4) Set PYTHONPATH so FastAPI recognizes `app`
ENV PYTHONPATH=/app

# 5) Install Python dependencies
RUN pip install --no-cache-dir -r /app/requirements.txt

# 6) Expose the API port
EXPOSE 8000

# 7) Run FastAPI with Uvicorn
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
