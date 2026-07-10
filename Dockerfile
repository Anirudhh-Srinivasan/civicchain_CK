FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY civicchain/backend/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip && pip install -r /tmp/requirements.txt

COPY . /app

WORKDIR /app/civicchain

CMD ["sh", "-c", "uvicorn backend.production:app --host 0.0.0.0 --port ${PORT:-8000}"]
