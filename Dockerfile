# Serves the web app and the API from the committed data cache. No Earth Engine, no network access to data sources needed.
#   docker build -t elmina-canopy .
#   docker run --rm -p 8000:8000 elmina-canopy      then open http://localhost:8000/
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY backend/requirements-serve.txt backend/requirements-serve.txt
RUN pip install --no-cache-dir -r backend/requirements-serve.txt
COPY backend backend
COPY frontend frontend
COPY ml/reports ml/reports
RUN useradd --create-home app && chown -R app /app
USER app
EXPOSE 8000
# $PORT is set by hosts such as Render; locally it falls back to 8000
CMD ["sh", "-c", "uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
