FROM python:3.9-slim

WORKDIR /app

# Instalacja zależności systemowych (dodano openssh-client)
RUN apt-get update && apt-get install -y \
    curl \
    postgresql-client \
    gcc \
    libpq-dev \
    socat \
    lsof \
    netcat-openbsd \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Kopiowanie i instalacja zależności Pythona
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install email-validator psycopg2-binary

# Kopiowanie kodu aplikacji
COPY . .

# Tworzenie katalogu .ssh
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

# Tworzenie skryptu startowego
RUN echo '#!/bin/bash \n\
# Ustawienie prawidłowych uprawnień dla klucza SSH \n\
echo "Setting correct permissions for SSH key..." \n\
if [ -f /root/.ssh/id_rsa ]; then \n\
  chmod 600 /root/.ssh/id_rsa \n\
  echo "SSH key permissions set successfully" \n\
else \n\
  echo "Warning: SSH key not found at /root/.ssh/id_rsa" \n\
fi \n\
\n\
echo "Waiting for PostgreSQL..." \n\
while ! nc -z postgres 5432; do \n\
  sleep 0.5 \n\
done \n\
echo "PostgreSQL started" \n\
\n\
# Uruchomienie migracji \n\
alembic upgrade head \n\
\n\
# Uruchomienie serwera FastAPI \n\
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload' > /app/entrypoint.sh \
&& chmod +x /app/entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Port
EXPOSE 8000

# Uruchomienie aplikacji
CMD ["/app/entrypoint.sh"]