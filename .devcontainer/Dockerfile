# Use Ubuntu as the base image
FROM mcr.microsoft.com/vscode/devcontainers/base:ubuntu-22.04

# Install Python and necessary system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    python3-dev \
    python3-venv \
    build-essential \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && \
    npm install -g npm@latest

# Install PostgreSQL client
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for Docker-in-Docker support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Create and set workspace directory
WORKDIR /workspace

# Expose ports for Flask/FastAPI (5000) and React (3000)
EXPOSE 5000 3000

# Default shell
CMD ["bash"]
