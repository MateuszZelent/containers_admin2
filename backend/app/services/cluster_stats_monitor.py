import asyncio
import re
from typing import Dict, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session

from app.services.slurm import SlurmSSHService
from app.services.cluster_stats import ClusterStatsService
from app.schemas.cluster_stats import ClusterStatsCreate
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

            # Execute the script with -j option for JSON format
            command = f"bash {script_path} -j"

            cluster_logger.debug(f"Executing cluster stats command: {command}")
            output = await self.slurm_service._execute_async_command(command)

            if not output:
                cluster_logger.warning("Empty output from cluster stats script")
                return None

            cluster_logger.debug(f"Cluster stats output:\n{output}")

            # Parse the output (now JSON format)
            stats = self._parse_cluster_stats_json(output)

            if stats:
                cluster_logger.info(
                    f"Parsed cluster stats: "
                    f"nodes=free:{stats['free_nodes']}/busy:{stats['busy_nodes']}/"
                    f"sleeping:{stats['sleeping_nodes']}/total:{stats['total_nodes']}, "
                    f"gpus=free:{stats['free_gpus']}/busy:{stats['busy_gpus']}/"
                    f"total:{stats['total_gpus']}"
                )

            return stats

        except Exception as e:
            cluster_logger.error(f"Error executing cluster stats script: {str(e)}")
            return None

    def _parse_cluster_stats_json(
        self, output: str
    ) -> Optional[Dict[str, int]]:
        """Parse JSON output from the cluster stats script.

        Expected JSON format:
        {
          "timestamp": "2025-07-29T13:30:00+02:00",
          "nodes": {
            "free": 8,
            "busy": 12,
            "sleeping": 57,
            "total": 77
          },
          "gpus": {
            "free": 256,
            "busy": 44,
            "total": 308
          }
        }
        """
        try:
            import json
            
            # Extract JSON part from output (skip header lines)
            # Look for lines starting with { and count braces to find matching }
            lines = output.strip().split('\n')
            json_start = -1
            json_end = -1
            brace_count = 0
            
            for i, line in enumerate(lines):
                stripped_line = line.strip()
                if stripped_line.startswith('{') and json_start == -1:
                    json_start = i
                    
                if json_start != -1:
                    # Count braces to find matching closing brace
                    brace_count += stripped_line.count('{') - stripped_line.count('}')
                    if brace_count == 0:
                        json_end = i
                        break
            
            if json_start == -1 or json_end == -1:
                cluster_logger.error("No valid JSON found in output")
                cluster_logger.debug(f"Output was:\n{output}")
                return None
            
            # Extract and parse JSON
            json_text = '\n'.join(lines[json_start:json_end + 1])
            cluster_logger.debug(f"Extracted JSON: {json_text}")
            data = json.loads(json_text)
            
            # Check for error in JSON
            if "error" in data:
                cluster_logger.error(f"Script returned error: {data['error']}")
                return None
            
            # Extract data with proper field names for database
            stats = {
                "free_nodes": data["nodes"]["free"],
                "busy_nodes": data["nodes"]["busy"],
                "sleeping_nodes": data["nodes"]["sleeping"],
                "total_nodes": data["nodes"]["total"],
                "free_gpus": data["gpus"]["free"],
                "active_gpus": 0,  # JSON doesn't distinguish active/standby
                "standby_gpus": 0,  # All free GPU are counted as free, not standby
                "busy_gpus": data["gpus"]["busy"],
                "total_gpus": data["gpus"]["total"],
            }
            
            return stats
            
        except json.JSONDecodeError as e:
            cluster_logger.error(f"Error parsing JSON output: {str(e)}")
            cluster_logger.debug(f"Invalid JSON output:\n{output}")
            return None
        except KeyError as e:
            cluster_logger.error(f"Missing required field in JSON: {str(e)}")
            cluster_logger.debug(f"JSON output:\n{output}")
            return None
        except Exception as e:
            cluster_logger.error(f"Error parsing cluster stats JSON: {str(e)}")
            return None

    def _parse_cluster_stats_output(self, output: str) -> Optional[Dict[str, int]]:
        """Parse the new format output from the cluster stats script.

        Expected format:
        WĘZŁY:
        Free nodes: 11
        Busy nodes: 1
        Unavailable nodes: 65
        Total nodes: 77

        GPU:
        Free GPUS: 262 (active: 2 + standby: 260)
        Busy GPUS: 46
        Total GPUS: 308

        or, if no GPUs:
        GPU: brak
        """
        try:
            lines = output.strip().split("\n")

            stats = {
                "free_nodes": 0,
                "busy_nodes": 0,
                "sleeping_nodes": 0,  # zmienione z unavailable_nodes
                "total_nodes": 0,
                "free_gpus": 0,
                "active_gpus": 0,
                "standby_gpus": 0,
                "busy_gpus": 0,
                "total_gpus": 0,
            }

            section = None  # "nodes", "gpus" lub None

            for raw_line in lines:
                line = raw_line.strip()

                # Rozpoznajemy początek sekcji
                if line == "WĘZŁY:":
                    section = "nodes"
                    continue
                elif line.startswith("GPU:"):
                    # Jeżeli jest dokładnie "GPU: brak", to wyłączamy sekcję GPU
                    if line == "GPU: brak":
                        section = None
                    else:
                        section = "gpus"
                    continue

                # Parsowanie sekcji "nodes"
                if section == "nodes":
                    if line.startswith("Free nodes:"):
                        match = re.search(r"Free nodes:\s*(\d+)", line)
                        if match:
                            stats["free_nodes"] = int(match.group(1))
                    elif line.startswith("Busy nodes:"):
                        match = re.search(r"Busy nodes:\s*(\d+)", line)
                        if match:
                            stats["busy_nodes"] = int(match.group(1))
                    elif line.startswith("Sleeping nodes:"):
                        match = re.search(r"Sleeping nodes:\s*(\d+)", line)
                        if match:
                            stats["sleeping_nodes"] = int(match.group(1))
                    elif line.startswith("Total nodes:"):
                        match = re.search(r"Total nodes:\s*(\d+)", line)
                        if match:
                            stats["total_nodes"] = int(match.group(1))

                # Parsowanie sekcji "gpus"
                elif section == "gpus":
                    if line.startswith("Free GPUS:"):
                        # W linii może być: "Free GPUS: 262 (active: 2 + standby: 260)"
                        main_match = re.search(r"Free GPUS:\s*(\d+)", line)
                        if main_match:
                            stats["free_gpus"] = int(main_match.group(1))
                        active_match = re.search(r"active:\s*(\d+)", line)
                        standby_match = re.search(r"standby:\s*(\d+)", line)
                        if active_match:
                            stats["active_gpus"] = int(active_match.group(1))
                        if standby_match:
                            stats["standby_gpus"] = int(standby_match.group(1))
                    elif line.startswith("Busy GPUS:"):
                        match = re.search(r"Busy GPUS:\s*(\d+)", line)
                        if match:
                            stats["busy_gpus"] = int(match.group(1))
                    elif line.startswith("Total GPUS:"):
                        match = re.search(r"Total GPUS:\s*(\d+)", line)
                        if match:
                            stats["total_gpus"] = int(match.group(1))

            # Jeżeli nie udało się pozyskać żadnych danych (zarówno węzłów, jak i GPU), zwracamy None
            if stats["total_nodes"] == 0 and stats["total_gpus"] == 0:
                cluster_logger.warning(
                    "Could not parse any meaningful data from output"
                )
                return None

            return stats

        except Exception as e:
            cluster_logger.error(f"Error parsing cluster stats output: {str(e)}")
            return None

    async def update_cluster_stats(self) -> bool:
        """Fetch and update cluster statistics in the database."""
        try:
            # Try the new script format first
            stats_data = await self.execute_cluster_stats_script()

            # If script fails, try direct SLURM commands (fallback)
            if not stats_data:
                cluster_logger.info("Script failed, trying direct SLURM commands...")
                stats_data = await self.execute_direct_slurm_commands()

            if not stats_data:
                cluster_logger.warning("Failed to get cluster statistics")
                return False

            # Create stats object for database
            cluster_stats = ClusterStatsCreate(
                free_nodes=stats_data["free_nodes"],
                busy_nodes=stats_data["busy_nodes"],
                sleeping_nodes=stats_data["sleeping_nodes"],
                total_nodes=stats_data["total_nodes"],
                free_gpus=stats_data["free_gpus"],
                active_gpus=stats_data["active_gpus"],
                standby_gpus=stats_data["standby_gpus"],
                busy_gpus=stats_data["busy_gpus"],
                total_gpus=stats_data["total_gpus"],
                source="check.sh",
            )

            # Save to database
            db_stats = self.cluster_stats_service.create_or_update(
                self.db, cluster_stats
            )

            cluster_logger.info(
                f"Successfully updated cluster stats in database: "
                f"nodes=free:{db_stats.free_nodes}/busy:{db_stats.busy_nodes}/"
                f"sleeping:{db_stats.sleeping_nodes}/total:{db_stats.total_nodes}, "
                f"gpus=free:{db_stats.free_gpus}/busy:{db_stats.busy_gpus}/"
                f"total:{db_stats.total_gpus}"
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
                    "message": "No cluster statistics available",
                }

            # Calculate utilization percentages using new fields
            node_utilization = (
                (current_stats.busy_nodes / current_stats.total_nodes * 100)
                if current_stats.total_nodes > 0
                else 0
            )

            gpu_utilization = (
                (current_stats.busy_gpus / current_stats.total_gpus * 100)
                if current_stats.total_gpus > 0
                else 0
            )

            timestamp_str = (
                current_stats.timestamp.isoformat()
                if current_stats.timestamp else None
            )
            
            return {
                "status": "ok",
                "timestamp": timestamp_str,
                "nodes": {
                    "free": current_stats.free_nodes,
                    "busy": current_stats.busy_nodes,
                    "sleeping": current_stats.sleeping_nodes,
                    "total": current_stats.total_nodes,
                    "available": current_stats.free_nodes + current_stats.sleeping_nodes,  # available = free + sleeping
                    "utilization_percent": round(node_utilization, 1),
                },
                "gpus": {
                    "free": current_stats.free_gpus,
                    "active": current_stats.active_gpus,
                    "standby": current_stats.standby_gpus,
                    "busy": current_stats.busy_gpus,
                    "total": current_stats.total_gpus,
                    "available": current_stats.free_gpus,  # available = only free GPUs (standby already included)
                    "utilization_percent": round(gpu_utilization, 1),
                },
            }

        except Exception as e:
            cluster_logger.error(f"Error getting cluster status summary: {str(e)}")
            return {"status": "error", "message": str(e)}

    async def execute_direct_slurm_commands(self) -> Optional[Dict[str, int]]:
        """Execute SLURM commands directly as fallback method."""
        try:
            cluster_logger.debug("Executing direct SLURM commands for stats")

            # Get node information
            node_cmd = "sinfo -p proxima -h -o '%n %a %t'"
            node_output = await self.slurm_service._execute_async_command(node_cmd)

            if not node_output:
                cluster_logger.warning("Empty output from sinfo command")
                return None

            # Parse nodes
            lines = node_output.strip().split("\n")
            total_nodes = len([line for line in lines if line.strip()])
            available_nodes = len(
                [
                    line
                    for line in lines
                    if "up" in line and ("idle" in line or "mixed" in line)
                ]
            )
            busy_nodes = len(
                [line for line in lines if "up" in line and "alloc" in line]
            )
            sleeping_nodes = total_nodes - available_nodes - busy_nodes

            # Get GPU information
            gpu_cmd = "sinfo -p proxima -o '%n %G %t %a' -h"
            gpu_output = await self.slurm_service._execute_async_command(gpu_cmd)

            total_gpus = 0
            busy_gpus = 0

            if gpu_output:
                for line in gpu_output.strip().split("\n"):
                    if line.strip():
                        parts = line.split()
                        if len(parts) >= 4:
                            gres = parts[1]
                            state = parts[2]
                            avail = parts[3]

                            if "gpu" in gres.lower():
                                # Simple GPU counting
                                gpu_count = 4  # Assume 4 GPUs per GPU node
                                total_gpus += gpu_count

                                if avail == "up":
                                    if state == "alloc":
                                        busy_gpus += gpu_count
                                    elif state == "mixed":
                                        # Assume half GPUs used in mixed state
                                        busy_gpus += gpu_count // 2

            stats = {
                "free_nodes": available_nodes,
                "busy_nodes": busy_nodes,
                "sleeping_nodes": sleeping_nodes,
                "total_nodes": total_nodes,
                "free_gpus": total_gpus - busy_gpus,
                "active_gpus": 0,  # Cannot determine from SLURM
                "standby_gpus": total_gpus - busy_gpus,
                "busy_gpus": busy_gpus,
                "total_gpus": total_gpus,
            }

            cluster_logger.info(
                f"Direct SLURM stats: "
                f"nodes=free:{stats['free_nodes']}/busy:{stats['busy_nodes']}/"
                f"sleeping:{stats['sleeping_nodes']}/total:{stats['total_nodes']}, "
                f"gpus=free:{stats['free_gpus']}/busy:{stats['busy_gpus']}/"
                f"total:{stats['total_gpus']}"
            )

            return stats

        except Exception as e:
            cluster_logger.error(f"Error executing direct SLURM commands: {str(e)}")
            return None
