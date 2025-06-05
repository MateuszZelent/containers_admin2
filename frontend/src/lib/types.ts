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
}