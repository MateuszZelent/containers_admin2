# SLURM Container Manager Backend

A FastAPI backend for managing SLURM containers via SSH. This application allows users to manage their containerized jobs on a SLURM cluster.

## Features

- User authentication with JWT
- SSH connection to SLURM cluster
- Template-based job submission
- Job monitoring and status tracking
- REST API for integration with frontend applications

## Requirements

- Python 3.7+
- SLURM cluster with SSH access
- Singularity/Apptainer installed on the SLURM cluster

## Installation

1. Clone the repository
2. Install the requirements:

```bash
pip install -r requirements.txt
```

3. Configure the environment variables in the `.env` file, especially:
   - SLURM_HOST: Hostname of your SLURM cluster
   - SLURM_PORT: SSH port
   - SLURM_USER: Your username (leave empty to use the current user)
   - SLURM_KEY_FILE: Path to your SSH key file

## Database Setup

The application uses SQLAlchemy with SQLite by default. To initialize the database:

```bash
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

## Running the Application

Start the FastAPI application with Uvicorn:

```bash
cd backend
python main.py
```

The API will be available at http://localhost:8000.

API Documentation will be available at http://localhost:8000/docs.

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login to get a JWT token (accepts optional `remember_me` boolean)

#### Example

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
     -d "username=myuser&password=mypass&remember_me=true" \
     -H "Content-Type: application/x-www-form-urlencoded"
```

### Users
- `POST /api/v1/users/` - Register a new user
- `GET /api/v1/users/me` - Get current user info
- `PUT /api/v1/users/me` - Update current user

### SLURM Jobs
- `GET /api/v1/jobs/status` - Check cluster status
- `GET /api/v1/jobs/` - List all jobs for current user
- `GET /api/v1/jobs/active-jobs` - Get active jobs from SLURM
- `GET /api/v1/jobs/templates` - List available job templates
- `POST /api/v1/jobs/` - Create a new job
- `GET /api/v1/jobs/{job_id}` - Get job details
- `GET /api/v1/jobs/{job_id}/status` - Check job status
- `GET /api/v1/jobs/{job_id}/node` - Get node where job is running

## Creating a New Job

To create a new job, send a POST request to `/api/v1/jobs/` with the following JSON payload:

```json
{
  "job_name": "my_container",
  "cpu": 4,
  "memory_gb": 8,
  "gpu": 1,
  "partition": "gpu",
  "template_name": "manga.template"
}
```

## Environment Variables

All configuration is done through environment variables defined in the `.env` file:

- `PROJECT_NAME` - Name of the project
- `API_V1_STR` - API version prefix
- `SECRET_KEY` - Secret key for JWT encoding
- `ACCESS_TOKEN_EXPIRE_MINUTES` - Token expiration time
- `ALGORITHM` - Algorithm used for JWT
- `SLURM_HOST` - SLURM cluster hostname
- `SLURM_PORT` - SSH port for SLURM cluster
- `SLURM_USER` - Username for SSH connection
- `SLURM_PASSWORD` - Password (if not using key-based auth)
- `SLURM_KEY_FILE` - Path to SSH key file
- `CONTAINER_OUTPUT_DIR` - Directory for container scripts on cluster
- `TEMPLATE_DIR` - Directory containing SLURM job templates
- `BACKEND_CORS_ORIGINS` - List of allowed CORS origins
- `DATABASE_URL` - SQLAlchemy database URL

## Template Placeholders

Templates can use the following placeholders:

- `{job_name}` - Name of the job
- `{partition}` - SLURM partition
- `{num_nodes}` - Number of nodes
- `{tasks_per_node}` - Tasks per node
- `{num_cpus}` - Number of CPUs
- `{memory_gb}` - Memory in GB
- `{num_gpus}` - Number of GPUs
- `{time_limit}` - Time limit for job
- `{loggin_name}` - Login name
- `{loginname}` - Login name (alternative)