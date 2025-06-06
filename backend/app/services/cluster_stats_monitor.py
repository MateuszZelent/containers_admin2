import asyncio
import re
from typing import Dict, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session

from app.services.slurm import SlurmSSHService
from app.services.cluster_stats import ClusterStatsService
from app.schemas.cluster import ClusterStatsCreate
from app.core.logging import cluster_logger


class ClusterStatsMonitorService:
    """Service for monitoring cluster statistics via SSH."""

    def __init__(self, db: Session):
        self.db = db
        self.slurm_service = SlurmSSHService()
        self.cluster_stats_service = ClusterStatsService()

    async def execute_cluster_stats_script(self) -> Optional[Dict[str, int]]:
        """Execute the cluster stats script on the remote server and parse results."""
        try:
            # Define the script path on the remote server
            script_path = "/mnt/storage_3/home/kkingstoun/scripts/check.sh"
            
            # Execute the script with summary option
            command = f"bash {script_path} --summary"
            
            cluster_logger.debug(f"Executing cluster stats command: {command}")
            output = await self.slurm_service._execute_async_command(command)
            
            if not output:
                cluster_logger.warning("Empty output from cluster stats script")
                return None
                
            cluster_logger.debug(f"Cluster stats output:\n{output}")
            
            # Parse the output
            stats = self._parse_cluster_stats_output(output)
            
            if stats:
                cluster_logger.info(
                    f"Parsed cluster stats: "
                    f"nodes={stats['used_nodes']}/{stats['total_nodes']}, "
                    f"gpus={stats['used_gpus']}/{stats['total_gpus']}"
                )
            
            return stats
            
        except Exception as e:
            cluster_logger.error(f"Error executing cluster stats script: {str(e)}")
            return None

    def _parse_cluster_stats_output(self, output: str) -> Optional[Dict[str, int]]:
        """Parse the output from the cluster stats script."""
        try:
            lines = output.strip().split('\n')
            
            used_nodes = total_nodes = used_gpus = total_gpus = 0
            
            for line in lines:
                line = line.strip()
                
                # Parse nodes line: "WĘZŁY: used/total"
                nodes_match = re.search(r'WĘZŁY:\s*(\d+)/(\d+)', line)
                if nodes_match:
                    used_nodes = int(nodes_match.group(1))
                    total_nodes = int(nodes_match.group(2))
                    continue
                
                # Parse GPU line: "GPU: used/total" or "GPU: brak"
                gpu_match = re.search(r'GPU:\s*(\d+)/(\d+)', line)
                if gpu_match:
                    used_gpus = int(gpu_match.group(1))
                    total_gpus = int(gpu_match.group(2))
                    continue
                elif 'GPU: brak' in line:
                    used_gpus = total_gpus = 0
                    continue
            
            # Validate that we got all required values
            if total_nodes == 0:
                cluster_logger.warning("Could not parse total nodes from output")
                return None
                
            return {
                'used_nodes': used_nodes,
                'total_nodes': total_nodes,
                'used_gpus': used_gpus,
                'total_gpus': total_gpus
            }
            
        except Exception as e:
            cluster_logger.error(f"Error parsing cluster stats output: {str(e)}")
            return None

    async def update_cluster_stats(self) -> bool:
        """Fetch and update cluster statistics in the database."""
        try:
            # Try direct SLURM commands first (fallback if script not available)
            stats_data = await self.execute_direct_slurm_commands()
            
            # If direct commands fail, try the script (if available)
            if not stats_data:
                cluster_logger.info("Direct commands failed, trying script...")
                stats_data = await self.execute_cluster_stats_script()
            
            if not stats_data:
                cluster_logger.warning("Failed to get cluster statistics")
                return False
            
            # Create stats object for database
            cluster_stats = ClusterStatsCreate(
                used_nodes=stats_data['used_nodes'],
                total_nodes=stats_data['total_nodes'],
                used_gpus=stats_data['used_gpus'],
                total_gpus=stats_data['total_gpus']
            )
            
            # Save to database
            db_stats = self.cluster_stats_service.create_or_update(
                self.db, cluster_stats
            )
            
            cluster_logger.info(
                f"Successfully updated cluster stats in database: "
                f"nodes={db_stats.used_nodes}/{db_stats.total_nodes}, "
                f"gpus={db_stats.used_gpus}/{db_stats.total_gpus}"
            )
            
            return True
            
        except Exception as e:
            cluster_logger.error(f"Error updating cluster stats: {str(e)}")
            return False

    async def get_cluster_status_summary(self) -> Dict[str, any]:
        """Get a summary of cluster status for monitoring."""
        try:
            # Get current stats from database
            current_stats = self.cluster_stats_service.get_current(self.db)
            
            if not current_stats:
                return {
                    "status": "no_data",
                    "message": "No cluster statistics available"
                }
            
            # Calculate utilization percentages
            node_utilization = (current_stats.used_nodes / current_stats.total_nodes * 100) if current_stats.total_nodes > 0 else 0
            gpu_utilization = (current_stats.used_gpus / current_stats.total_gpus * 100) if current_stats.total_gpus > 0 else 0
            
            return {
                "status": "ok",
                "timestamp": current_stats.timestamp,
                "nodes": {
                    "used": current_stats.used_nodes,
                    "total": current_stats.total_nodes,
                    "utilization_percent": round(node_utilization, 1)
                },
                "gpus": {
                    "used": current_stats.used_gpus,
                    "total": current_stats.total_gpus,
                    "utilization_percent": round(gpu_utilization, 1)
                }
            }
            
        except Exception as e:
            cluster_logger.error(f"Error getting cluster status summary: {str(e)}")
            return {
                "status": "error",
                "message": str(e)
            }

    async def execute_direct_slurm_commands(self) -> Optional[Dict[str, int]]:
        """Execute SLURM commands directly without requiring a script on the server."""
        try:
            cluster_logger.debug("Executing direct SLURM commands for stats")
            
            # Get node information
            node_cmd = "sinfo -p proxima -h -o '%n %a %t'"
            node_output = await self.slurm_service._execute_async_command(node_cmd)
            
            if not node_output:
                cluster_logger.warning("Empty output from sinfo command")
                return None
            
            # Parse nodes
            lines = node_output.strip().split('\n')
            total_nodes = len([line for line in lines if line.strip()])
            available_nodes = len([
                line for line in lines 
                if 'up' in line and ('idle' in line or 'mixed' in line)
            ])
            used_nodes = total_nodes - available_nodes
            
            # Get GPU information
            gpu_cmd = "sinfo -p proxima -o '%n %G %t %a' -h"
            gpu_output = await self.slurm_service._execute_async_command(gpu_cmd)
            
            total_gpus = 0
            used_gpus = 0
            
            if gpu_output:
                for line in gpu_output.strip().split('\n'):
                    if line.strip():
                        parts = line.split()
                        if len(parts) >= 4:
                            gres = parts[1]
                            state = parts[2]
                            avail = parts[3]
                            
                            if 'gpu' in gres.lower():
                                # Simple GPU counting - adjust based on your cluster
                                gpu_count = 4  # Assume 4 GPUs per GPU node
                                total_gpus += gpu_count
                                
                                if avail == 'up':
                                    if state == 'alloc':
                                        used_gpus += gpu_count
                                    elif state == 'mixed':
                                        # Assume half GPUs used in mixed state
                                        used_gpus += gpu_count // 2
            
            stats = {
                'used_nodes': used_nodes,
                'total_nodes': total_nodes,
                'used_gpus': used_gpus,
                'total_gpus': total_gpus
            }
            
            cluster_logger.info(
                f"Direct SLURM stats: nodes={used_nodes}/{total_nodes}, "
                f"gpus={used_gpus}/{total_gpus}"
            )
            
            return stats
            
        except Exception as e:
            cluster_logger.error(f"Error executing direct SLURM commands: {str(e)}")
            return None
