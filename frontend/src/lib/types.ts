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