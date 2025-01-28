#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define the project directory
PROJECT_DIR="/workspaces/Satellite-Interactive-Visualizer-And-Fleet-Optimization"

# Define the virtual environment directory
VENV_DIR="$PROJECT_DIR/venv"

echo "Starting setup..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
  echo "Python 3 is not installed. Please install Python 3."
  exit 1
fi

# Create the virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# Activate the virtual environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Upgrade pip, setuptools, and wheel
echo "Upgrading pip, setuptools, and wheel..."
pip install --upgrade pip setuptools wheel

# Install dependencies from requirements.txt
if [ -f "$PROJECT_DIR/requirements.txt" ]; then
  echo "Installing dependencies..."
  pip install --no-cache-dir -r "$PROJECT_DIR/requirements.txt"
else
  echo "requirements.txt not found. Skipping dependency installation."
fi

# Any additional setup commands can go here

echo "Setup completed successfully!"
