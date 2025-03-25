FROM python:3.9-slim

WORKDIR /app

# Zainstaluj narzędzia potrzebne do kompilacji i debugowania
RUN apt-get update && apt-get install -y \
    curl \
    postgresql-client \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Zainstaluj zależności, w tym email-validator
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install email-validator \
    && pip install psycopg2-binary \
    && pip install logger 
COPY . .

# Skrypt startowy
RUN echo '#!/bin/bash\n\
echo "Waiting for database..."\n\
while ! nc -z db 5432; do\n\
  sleep 0.5\n\
done\n\
echo "Database started"\n\
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload' > /app/start.sh \
&& chmod +x /app/start.sh

# Health check używający poprawnego endpoint
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

# Uruchomienie z przygotowanym skryptem
CMD ["/app/start.sh"]
