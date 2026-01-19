# Use a slim Python image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for building Python packages, (gcc, g++ might be needed for some libraries)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*
# apt is a package manager for Debian and Ubuntu based systems 
# apt-get update - updates the package list every time the container is built
# apt-get install -y - installs the packages every time the container is built
# build-essential - is a package that contains the essential tools for building Python packages
# rm -rf /var/lib/apt/lists/* - removes the package list to keep the image smaller 

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
# --no-cache-dir helps keep the image smaller
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose the application port
EXPOSE 5001

# Start the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
