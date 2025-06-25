export interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at?: string;
  max_containers?: number;
  max_gpus?: number;
}

export interface SSHTunnel {
  id: number;
  job_id: number;
  local_port: number;
  remote_port: number;
  node: string;
  status: string;
  created_at: string;
}

export interface Job {
  id: number;
  job_id: string;
  job_name: string;
  template_name: string;
  status: string;
  node: string | null;
  port: number | null;
  partition: string;
  num_nodes: number;
  tasks_per_node: number;
  num_cpus: number;
  memory_gb: number;
  num_gpus: number;
  time_limit: string;
  script: string;
  created_at: string;
  updated_at: string | null;
  owner_id: number;
  tunnels: SSHTunnel[];
  
  // Additional fields for unified job interface (containers + task_queue)
  type?: 'container' | 'task_queue';  // Job type
  name?: string;                       // Unified name field
  simulation_file?: string;            // For task_queue jobs
  progress?: number;                   // Progress percentage (0-100)
  time_used?: string;                  // Time used from SLURM
  time_left?: string;                  // Time left from SLURM
  domain_ready?: boolean;              // Whether Caddy domain is ready
}

// Task Queue types
export interface TaskQueueJob {
  id: number;
  task_id: string;
  name: string;
  status: string;
  progress?: number;
  priority: number;
  task_type: string;
  simulation_file: string;
  slurm_job_id?: string;
  node?: string;
  partition?: string;
  num_cpus?: number;
  memory_gb?: number;
  num_gpus?: number;
  time_limit?: string;
  script?: string;
  logs?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  updated_at?: string;
  owner_id: number;
  
  // Additional SLURM details
  time_used?: string;
  time_left?: string;
}

export interface TaskQueueStatus {
  total_tasks: number;
  pending_tasks: number;
  running_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  avg_wait_time_minutes: number;
}

export interface ClusterStats {
  id: number;
  // Nowe szczegółowe pola węzłów
  free_nodes: number;
  busy_nodes: number;
  unavailable_nodes: number;
  total_nodes: number;
  // Nowe szczegółowe pola GPU
  free_gpus: number;
  active_gpus: number;
  standby_gpus: number;
  busy_gpus: number;
  total_gpus: number;
  // Legacy pola (dla kompatybilności wstecznej)
  used_nodes: number;
  used_gpus: number;
  timestamp: string;
  source?: string;
}