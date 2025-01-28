#!/bin/bash

# Activate the virtual environment
source /workspace/.venv/bin/activate

# Install Python dependencies
if [ -f "requirements.txt" ]; then
    pip install --no-cache-dir -r requirements.txt
fi

# Install Node.js dependencies (if package.json exists)
if [ -f "package.json" ]; then
    npm install
fi
