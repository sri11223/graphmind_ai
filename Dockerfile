# ── Backend (Render.com) ─────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy dataset
COPY sap-o2c-data/ ./sap-o2c-data/

# Expose port
EXPOSE 8000

# Run
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
