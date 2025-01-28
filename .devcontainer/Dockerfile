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
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js and npm (if needed for React or web-based elements)
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && \
    npm install -g npm@latest

# Install PostgreSQL client
RUN apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI and add user to Docker group
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && apt-get install -y docker-ce-cli && \
    groupadd docker && usermod -aG docker vscode && \
    rm -rf /var/lib/apt/lists/*

# Upgrade pip and install common Python utilities
RUN pip install --upgrade pip setuptools wheel

# Set the workspace directory
WORKDIR /workspace

# Create and activate Python virtual environment
ENV VIRTUAL_ENV=/workspace/.venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN python3 -m venv $VIRTUAL_ENV && \
    . $VIRTUAL_ENV/bin/activate && \
    pip install --upgrade pip setuptools wheel

# Expose ports for Flask/FastAPI (5000) and React (3000)
EXPOSE 5000 3000

# Default shell
CMD ["bash"]
