# ============================================================================
# Multi-Stage Dockerfile for Hugging Face Spaces Deployment
# Python ML Web Application with Flask + Uvicorn (ASGI)
# ============================================================================
# This Dockerfile uses a secure, minimal, multi-stage build to:
#   - Install build dependencies in a builder stage
#   - Copy only runtime essentials to the final stage
#   - Serve static files from assets/
#   - Load ML models from model/
#   - Read secrets from environment variables (HF_TOKEN, GEE_KEY)
#   - Run on Hugging Face required port 7860 via uvicorn
# ============================================================================

# ============================================================================
# STAGE 1: Builder
# ============================================================================
# Use Python 3.11 slim image for minimal size
FROM python:3.11-slim AS builder

# Set working directory for the build stage
WORKDIR /build

# Install system build dependencies required for Python packages
# - build-essential: C/C++ compilers for native extensions
# - libgdal-dev: GDAL library for geospatial operations
# - libproj-dev: PROJ library for cartographic projections
# These are needed during pip install but not in the final runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies into a virtual environment
# This keeps dependencies isolated and makes them easy to copy to the final stage
# Using --no-cache-dir prevents pip from caching packages (saves space)
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir asgiref uvicorn

# ============================================================================
# STAGE 2: Runtime
# ============================================================================
FROM python:3.11-slim

# Set working directory for the application
WORKDIR /app

# Install only runtime dependencies (minimal set)
# - No build tools needed here, only runtime libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy the virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv

# Set PATH to use the virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
# Order matters: copy files that change least frequently first for better caching
COPY model/ /app/model/
COPY utils/ /app/utils/
COPY assets/ /app/assets/
COPY app.py /app/
COPY asgi.py /app/

# Set environment variables
# PORT: Hugging Face Spaces requires port 7860
# PYTHONUNBUFFERED: Ensures Python output is sent straight to terminal (useful for logs)
# PYTHONDONTWRITEBYTECODE: Prevents Python from writing .pyc files
ENV PORT=7860 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Expose the port that Hugging Face Spaces expects
EXPOSE 7860

# Health check to verify the service is running
# This pings the root endpoint every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/')"

# Run the application using uvicorn (ASGI server)
# - asgi:asgi_app: References the asgi_app object in asgi.py
# - --host 0.0.0.0: Listen on all network interfaces (required for Docker)
# - --port 7860: Hugging Face Spaces required port
# - --workers 1: Single worker process (HF Spaces typically run on limited resources)
# - --log-level info: Adequate logging for production
CMD ["uvicorn", "asgi:asgi_app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--log-level", "info"]
