# Use a minimal Python image
FROM python:3.10-slim

# Set working directory inside the container
WORKDIR /app

# Copy the entire backend directory to the container
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir -r /app/requirements.txt

# Expose the FastAPI port
EXPOSE 8000

# Start FastAPI app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
