-- Utworzenie tabel potrzebnych dla aplikacji

-- Tabela użytkowników
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_superuser BOOLEAN DEFAULT FALSE,
    code_server_password VARCHAR(100),
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela zadań
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    num_cpus INTEGER NOT NULL,
    memory_gb INTEGER NOT NULL,
    num_gpus INTEGER NOT NULL,
    time_limit VARCHAR(20) NOT NULL,
    port INTEGER,
    password VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    slurm_job_id INTEGER,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela tuneli SSH
CREATE TABLE IF NOT EXISTS ssh_tunnels (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    local_port INTEGER NOT NULL,
    remote_port INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dodanie indeksów
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_ssh_tunnels_job_id ON ssh_tunnels(job_id);
