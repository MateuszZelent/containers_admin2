# PostgreSQL dla Containers Admin

Ten katalog zawiera konfigurację dla kontenera PostgreSQL używanego przez backend Containers Admin.

## Uruchomienie bazy danych

```bash
# Nadaj uprawnienia wykonywania dla skryptów
chmod +x *.sh

# Uruchom bazę danych
./start-db.sh
```

## Połączenie z bazą danych

```bash
# Za pomocą psql z hosta
psql -h localhost -U postgres -d containers_admin

# Za pomocą psql z kontenera
docker exec -it containers_admin_postgres psql -U postgres -d containers_admin
```

## Backup i przywracanie bazy danych

```bash
# Wykonaj backup bazy danych
./backup-db.sh

# Przywróć bazę danych z pliku backupu
./restore-db.sh ./backups/containers_admin_backup_20250401_120000.sql
```

## Konfiguracja

Podstawowa konfiguracja znajduje się w pliku `.env`. Możesz dostosować następujące parametry:

- `POSTGRES_USER`: nazwa użytkownika (domyślnie: postgres)
- `POSTGRES_PASSWORD`: hasło użytkownika (domyślnie: postgres)
- `POSTGRES_DB`: nazwa bazy danych (domyślnie: containers_admin)
- `POSTGRES_PORT`: port, na którym nasłuchuje baza danych (domyślnie: 5432)

## Struktura bazy danych

- `users`: tabela przechowująca informacje o użytkownikach
- `jobs`: tabela przechowująca informacje o zadaniach
- `ssh_tunnels`: tabela przechowująca informacje o tunelach SSH

## Użytkownik testowy

- Login: testuser
- Hasło: password123
