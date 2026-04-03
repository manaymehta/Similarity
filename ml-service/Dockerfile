# PHASE 1
# This phase has the C++ compilers. It compiles hnswlib (from chromadb-client)
# and installs all Python packages into /root/.local.
# This entire phase is discarded after the build, it does not end up in the final image.
FROM python:3.10-slim AS builder

WORKDIR /app

# the c++ compiler is needed to be installed here because it is used to compile hnswlib from source
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*
# apt - package manager for Debian and Ubuntu based systems 
# apt-get update - updates the package list every time the container is built
# apt-get install -y - installs the packages every time the container is built
# build-essential - package that contains the essential tools for building Python packages
# rm -rf /var/lib/apt/lists/* - removes the package list to keep the image smaller 

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
# --user installs packages to /root/.local
# --no-cache-dir - prevents pip from caching the packages, which keeps the image smaller 

# PHASE 2
# clean and new container, omits the c++ compiler, only copy the finished compiled packages from Phase 1 
# this is the image that actually gets deployed
FROM python:3.10-slim

WORKDIR /app

# Copy the pre-compiled Python packages from Phase 1
# The compilers that built them are left behind and discarded
COPY --from=builder /root/.local /root/.local

COPY . .

# python can find packages installed in /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/root/.local/lib/python3.10/site-packages:$PYTHONPATH

# expose port
EXPOSE 5001

# start application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
