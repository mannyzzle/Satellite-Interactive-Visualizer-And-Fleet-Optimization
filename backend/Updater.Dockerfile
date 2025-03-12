# Use official Python 3.12.7 base image
FROM python:3.12.7

# Set the working directory inside the container
WORKDIR /app

# Copy only the requirements file first (to leverage Docker caching)
COPY backend/requirements.txt /app/requirements.txt

# Install dependencies before copying the whole application
RUN pip install --no-cache-dir -r requirements.txt

# Now copy only the backend code (avoiding unnecessary files)
COPY backend /app

# Set environment variables (provided by GitHub Actions)
ENV DB_HOST=${DB_HOST}
ENV DB_PORT=${DB_PORT}
ENV DB_USER=${DB_USER}
ENV DB_PASSWORD=${DB_PASSWORD}
ENV DB_NAME=${DB_NAME}
ENV SPACETRACK_USER=${SPACETRACK_USER}
ENV SPACETRACK_PASS=${SPACETRACK_PASS}

# Default command (override in GitHub Actions)
CMD ["python3"]
