# CLI Workflow for MX3 Jobs

## Scenariusz 1: Upload tylko pliku (ZALECANE)

### 1. Upload pliku MX3
```bash
curl -X POST "http://your-server/task-queue/upload-mx3-file" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@simulation.mx3" \
  -F "description=My simulation file"
```

**Response:**
```json
{
  "job_key": "abc12345",
  "file_path": "/mnt/storage_2/scratch/pl0095-01/zelent/tmp/mx3jobs/username_abc12345/simulation.mx3",
  "file_md5": "d41d8cd98f00b204e9800998ecf8427e",
  "file_size": 1024,
  "message": "File uploaded successfully. Use file_path to create task.",
  "next_steps": [
    "Use the returned file_path to create a task via POST /task-queue/",
    "Monitor task progress via GET /task-queue/{task_id}"
  ]
}
```

### 2. Utworzenie zadania (ręcznie)
```bash
curl -X POST "http://your-server/task-queue/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My MX3 Simulation",
    "simulation_file": "/mnt/storage_2/scratch/pl0095-01/zelent/tmp/mx3jobs/username_abc12345/simulation.mx3",
    "partition": "proxima",
    "num_cpus": 5,
    "memory_gb": 24,
    "num_gpus": 1,
    "time_limit": "24:00:00",
    "priority": 0
  }'
```

### 3. Monitoring zadania
```bash
curl -X GET "http://your-server/task-queue/{task_id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Pobieranie wyników
```bash
curl -X GET "http://your-server/task-queue/{task_id}/download" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o results.zip
```

## Scenariusz 2: Upload + automatyczne uruchomienie

### Upload z auto-start
```bash
curl -X POST "http://your-server/task-queue/upload-mx3" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@simulation.mx3" \
  -F "task_name=My MX3 Simulation" \
  -F "auto_start=true" \
  -F "partition=proxima" \
  -F "num_cpus=5" \
  -F "memory_gb=24" \
  -F "num_gpus=1" \
  -F "time_limit=24:00:00"
```

## Ścieżki w systemie

**Container path (używana w TaskQueueJob):**
```
/mnt/storage_2/scratch/pl0095-01/zelent/tmp/mx3jobs/username_jobkey/file.mx3
```

**Host path (dla operacji na plikach):**
```
Same path - mounted via SSHFS
```

## CLI Integration

### Python CLI Example
```python
import requests
import os

class MX3Client:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {token}"}
    
    def upload_file(self, file_path, description=""):
        """Upload MX3 file without starting job"""
        with open(file_path, 'rb') as f:
            files = {'file': f}
            data = {'description': description}
            response = requests.post(
                f"{self.base_url}/task-queue/upload-mx3-file",
                headers=self.headers,
                files=files,
                data=data
            )
        return response.json()
    
    def create_task(self, file_path, **kwargs):
        """Create and start task"""
        data = {
            "name": kwargs.get("name", "MX3 Simulation"),
            "simulation_file": file_path,
            "partition": kwargs.get("partition", "proxima"),
            "num_cpus": kwargs.get("num_cpus", 5),
            "memory_gb": kwargs.get("memory_gb", 24),
            "num_gpus": kwargs.get("num_gpus", 1),
            "time_limit": kwargs.get("time_limit", "24:00:00"),
        }
        response = requests.post(
            f"{self.base_url}/task-queue/",
            headers=self.headers,
            json=data
        )
        return response.json()
    
    def upload_and_run(self, local_file, **kwargs):
        """Complete workflow: upload + create task"""
        # 1. Upload file
        upload_result = self.upload_file(local_file)
        
        # 2. Create task with uploaded file path
        task_result = self.create_task(
            upload_result["file_path"], 
            **kwargs
        )
        
        return {
            "upload": upload_result,
            "task": task_result
        }

# Usage
client = MX3Client("http://your-server", "your-token")
result = client.upload_and_run("my_simulation.mx3", name="Test Run")
print(f"Task created: {result['task']['task_id']}")
```
