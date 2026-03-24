# ── Backend API (Render.com) ──────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy dataset
COPY sap-o2c-data/ ./sap-o2c-data/

# Create non-root user and grant write access (SQLite needs to create .db/.wal/.shm)
RUN adduser --disabled-password --no-create-home appuser \
 && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check (used by Docker & orchestrators)
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Run
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
