FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=28761 \
    DB_PATH=/app/data/trainer.db \
    DATA_PATH=/app/data/XAUUSD_1M.parquet

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/data

EXPOSE 28761

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
