import asyncio
import os
import re
import hashlib
from typing import Dict, List, Optional, Tuple

import paramiko
import asyncssh
from fastapi import HTTPException

from app.core.config import settings
from app.core.logging import (
    ssh_logger,
    slurm_logger,
    cluster_logger,
    log_command,
    log_ssh_connection,
    log_slurm_job,
    log_cluster_operation,
)


class SlurmSSHService:
    """Service for interacting with SLURM via SSH."""

    def __init__(
        self,
        host: str = None,
        port: int = None,
        username: str = None,
        password: str = None,
        key_file: str = None,
    ):
        self.host = settings.SLURM_HOST
        self.port = settings.SLURM_PORT
        self.username = settings.SLURM_USER
        self.password = settings.SLURM_PASSWORD
        self.key_file = settings.SLURM_KEY_FILE

        if self.key_file and self.key_file.startswith("~"):
            self.key_file = os.path.expanduser(self.key_file)

        # Log initialization
        cluster_logger.debug(
            f"[bold]Initializing SLURM SSH Service[/bold]\n"
            f"  [cyan]Host:[/cyan] {self.host}\n"
            f"  [cyan]Port:[/cyan] {self.port}\n"
            f"  [cyan]Username:[/cyan] {self.username}\n"
            f"  [cyan]Key file:[/cyan] {self.key_file}"
        )

        # Sprawdź czy plik klucza istnieje
        if self.key_file and not os.path.exists(self.key_file):
            ssh_logger.error(f"SSH key file not found: {self.key_file}")
            raise HTTPException(
                status_code=500, detail=f"SSH key file not found: {self.key_file}"
            )

    async def _execute_async_command(self, command: str) -> str:
        """Execute a command via asyncssh."""
        try:
            # log_command(ssh_logger, command)
            # log_ssh_connection(self.host, self.username, using_key=bool(self.key_file))

            if self.key_file:
                # ssh_logger.debug(f"Using key file: {self.key_file}")
                try:
                    async with asyncssh.connect(
                        host=self.host,
                        port=self.port,
                        username=self.username,
                        client_keys=[self.key_file],
                        known_hosts=None,  # In production, use proper known_hosts
                    ) as conn:
                        ssh_logger.debug("SSH connection established successfully")
                        result = await conn.run(command)
                        # ssh_logger.debug(f"Command output:\n{result.stdout}")
                        return result.stdout
                except asyncssh.Error as key_error:
                    ssh_logger.error(
                        f"Key-based authentication failed: {str(key_error)}"
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=f"SSH key authentication failed: {str(key_error)}",
                    )
            else:
                ssh_logger.error("No SSH key file specified")
                raise HTTPException(
                    status_code=500, detail="SSH key file not configured"
                )

        except asyncssh.Error as exc:
            error_msg = str(exc)
            ssh_logger.error(f"SSH connection failed: {error_msg}")
            raise HTTPException(
                status_code=500, detail=f"SSH connection failed: {error_msg}"
            )
        except OSError as os_error:
            ssh_logger.error(f"OS error during SSH connection: {str(os_error)}")
            raise HTTPException(
                status_code=500,
                detail=f"OS error during SSH connection: {str(os_error)}",
            )
        except Exception as e:
            ssh_logger.error(f"Unexpected error during SSH connection: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected error during SSH connection: {str(e)}",
            )

    def _execute_command(self, command: str) -> str:
        """Execute a command via paramiko (synchronous)."""
        # log_command(ssh_logger, command)
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            # log_ssh_connection(self.host, self.username, using_key=bool(self.key_file))

            if self.key_file:
                client.connect(
                    self.host,
                    port=self.port,
                    username=self.username,
                    key_filename=self.key_file,
                )
            else:
                client.connect(
                    self.host,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                )

            ssh_logger.debug("SSH connection established successfully")
            stdin, stdout, stderr = client.exec_command(command)
            output = stdout.read().decode("utf-8")
            error = stderr.read().decode("utf-8")

            if error:
                ssh_logger.error(f"Command execution error: {error}")
                raise HTTPException(
                    status_code=500, detail=f"Command execution error: {error}"
                )

            # ssh_logger.debug(f"Command output:\n{output}")
            return output
        except Exception as e:
            ssh_logger.error(f"SSH command execution failed: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"SSH command execution failed: {str(e)}"
            )
        finally:
            client.close()
            ssh_logger.debug("SSH connection closed")

    async def check_status(self) -> Dict[str, bool]:
        """Check if the SLURM cluster is reachable and running."""
        cluster_logger.debug("Checking SLURM cluster status...")
        try:
            output = await self._execute_async_command("sinfo -h")
            status = {"connected": True, "slurm_running": len(output.strip()) > 0}
            log_cluster_operation("Status Check", status)
            return status
        except Exception as e:
            cluster_logger.error(f"Cluster status check failed: {str(e)}")
            return {"connected": False, "slurm_running": False}

    async def get_active_jobs(self, username: str = None) -> List[Dict[str, str]]:
        """Get active jobs for the specified user."""
        slurm_logger.debug(f"Fetching active jobs for user {username} ")

        # Format string definition (for reference):
        # %A: Job ID          (0) | %P: Partition      (1) | %j: Job name        (2) | %u: User           (3)
        # %T: Job state       (4) | %m: MemReq         (5) | %M: Time Used      (6) | %L: Time Left      (7)
        # %D: Node Count      (8) | %N: Node list      (9) | %S: Start time     (10)| %R: Reason         (11)
        # %b: MinMemGeneric   (12)| %V: Submission time(13)
        squeue_format = "%A|%P|%j|%u|%T|%m|%M|%L|%D|%N|%S|%R|%b|%V"
        expected_fields = len(squeue_format.split("|"))  # Oczekujemy 14 pól

        # Użyjemy --me tylko jeśli username nie jest podany, w przeciwnym razie filtrujemy po username
        # UWAGA: Filtrowanie po nazwie zadania jest mniej niezawodne niż użycie opcji SLURM.
        # Rozważ użycie `squeue -u {username} ...` jeśli to możliwe i bardziej odpowiednie.
        # Obecna logika filtruje PO pobraniu, co może być nieefektywne.
        # Zostawiam logikę filtrowania po nazwie, jak była, ale zwracam uwagę na potencjalne problemy.
        command = f"squeue --me -o '{squeue_format}' -h"  # Nadal pobiera dla --me, filtruje później
        output = await self._execute_async_command(command)

        jobs = []
        for line in output.strip().split("\n"):
            if not line:
                continue

            parts = line.split("|")
            # Bardziej rygorystyczne sprawdzenie liczby pól
            if len(parts) != expected_fields:
                slurm_logger.warning(
                    f"Unexpected number of fields ({len(parts)} instead of {expected_fields}) in squeue output line: {line}"
                )
                continue

            # --- Poprawione przypisanie wartości do zmiennych ---
            job_id = parts[0].strip()
            partition = parts[1].strip()
            name = parts[2].strip()
            user = parts[3].strip()
            state = parts[4].strip()
            memory_requested = parts[5].strip()  # %m - Pamięć wymagana (np. --mem)
            time_used = parts[6].strip()  # %M - Czas użyty
            time_left = parts[7].strip()  # %L - Czas pozostały
            node_count = parts[8].strip()  # %D - Liczba węzłów
            node = parts[9].strip()  # %N - Lista węzłów
            start_time = parts[10].strip()  # %S - Czas startu
            reason = parts[11].strip()  # %R - Powód (jeśli istnieje)
            # parts[12] (%b) - Min memory per CPU/generic - ignorujemy na razie, chyba że jest potrzebne
            submit_time = parts[13].strip()  # %V - Czas zgłoszenia

            # --- Tworzenie słownika job_info z poprawnymi danymi ---
            job_info = {
                "job_id": job_id,
                "partition": partition,
                "name": name,
                "user": user,
                "state": state,
                "memory_requested": memory_requested,  # Używamy %m jako głównego wskaźnika pamięci
                "time_used": time_used,  # Dodano poprawne pole 'time_used'
                "time_left": time_left,
                "node_count": node_count,
                "node": node,
                "start_time": start_time
                if start_time != "N/A"
                else None,  # Lepsze radzenie sobie z N/A
                "submit_time": submit_time if submit_time else None,
                "reason": reason if reason else None,
            }

            # Logika filtrowania pozostaje taka sama (z zastrzeżeniami wspomnianymi wyżej)
            # Only process container jobs
            if "container_" in name:
                # If username filter is provided
                if username:
                    # Pattern: "container_{username}{digits}" or "container_{username}_..."
                    # Bądźmy bardziej elastyczni z wzorcem
                    pattern = f"container_{username}"
                    if name.startswith(pattern):
                        jobs.append(job_info)
                        # log_slurm_job(job_id, state, job_info)
                        slurm_logger.debug(
                            f"Added job {job_id} matching username '{username}'"
                        )
                    # else:
                    # slurm_logger.debug(f"Job {job_id} name '{name}' does not match username pattern '{pattern}'")
                else:
                    # No username filter, include all container jobs
                    # log_slurm_job(job_id, state, job_info)
                    jobs.append(job_info)

        slurm_logger.debug(f"Found {len(jobs)} matching jobs")
        return jobs

    async def get_job_node(self, job_id: str) -> Optional[str]:
        """Get the node where a specific job is running."""
        slurm_logger.debug(f"Getting node information for job {job_id}")
        output = await self._execute_async_command(f"squeue -j {job_id} -o %N -h")
        node = output.strip() if output.strip() else None
        if node:
            log_cluster_operation(
                "Job Node Assignment", {"job_id": job_id, "node": node}
            )
        return node

    def _calculate_checksum(self, content: str) -> str:
        """Calculate SHA-256 checksum of script content."""
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    async def _verify_remote_file(
        self, remote_path: str, expected_checksum: str
    ) -> bool:
        """Verify if remote file matches expected checksum."""
        try:
            # Get checksum of remote file
            cmd = f"sha256sum {remote_path}"
            output = await self._execute_async_command(cmd)
            if not output:
                return False

            # Extract checksum from output (sha256sum outputs: "<hash>  <filename>")
            remote_checksum = output.split()[0]

            # Compare checksums
            match = remote_checksum == expected_checksum
            if not match:
                cluster_logger.error(
                    f"Checksum mismatch for {remote_path}:\n"
                    f"  Expected: {expected_checksum}\n"
                    f"  Got: {remote_checksum}"
                )
            return match
        except Exception as e:
            cluster_logger.error(f"Error verifying checksum: {str(e)}")
            return False

    async def _upload_script(
        self, script_content: str, script_path: str
    ) -> Tuple[bool, str]:
        """Upload script to remote host with checksum verification."""
        # Calculate checksum before upload
        checksum = self._calculate_checksum(script_content)

        # Replace EOL in heredocs with escaped version in the script content
        modified_content = script_content.replace("<<EOL", "<<'EOL'").replace(
            "<<-EOL", "<<-'EOL'"
        )

        # Use a different delimiter for our outer heredoc to avoid conflicts
        upload_cmd = (
            f"cat > {script_path} << 'ENDOFSCRIPT'\n{modified_content}\nENDOFSCRIPT"
        )
        await self._execute_async_command(upload_cmd)

        # Make executable
        await self._execute_async_command(f"chmod +x {script_path}")

        # Verify upload
        checksum_ok = await self._verify_remote_file(script_path, checksum)
        if not checksum_ok:
            slurm_logger.warning(
                f"Checksum verification failed for {script_path}\n"
                f"Expected: {checksum}\n"
                "This may indicate incomplete file transfer or modification during transfer."
            )

        return checksum_ok, checksum

    async def submit_job(self, script_content: str, username: str) -> str:
        """Submit a job to SLURM and return the job ID."""
        slurm_logger.debug("Preparing to submit job...")

        # Create directory if it doesn't exist
        container_dir = f"{settings.CONTAINER_OUTPUT_DIR}"
        if container_dir.startswith("~"):
            container_dir = container_dir.replace("~", f"/home/{username}")

        # log_cluster_operation("Creating Container Directory", {favicon.ico
        #     "path": container_dir,
        #     "user": username
        # })

        # Create directory without unnecessary output
        await self._execute_async_command(f"mkdir -p {container_dir}")

        # Create script file with timestamp
        script_filename = (
            f"{container_dir}/container_job_{int(asyncio.get_event_loop().time())}.sh"
        )
        slurm_logger.debug(f"Creating job script: {script_filename}")

        # Upload script and verify checksum
        success, checksum = await self._upload_script(script_content, script_filename)
        if not success:
            slurm_logger.warning(
                "Script checksum verification failed, but continuing with job submission.\n"
                "This might indicate that the script was not transferred completely or was modified during transfer."
            )

        slurm_logger.debug(f"Script uploaded (SHA-256: {checksum})")

        try:
            # Submit the job using sbatch
            slurm_logger.debug("Submitting job to SLURM using sbatch")

            output = await self._execute_async_command(f"sbatch {script_filename}")

            # Parse job ID from output
            match = re.search(r"Submitted batch job (\d+)", output)
            if match:
                job_id = match.group(1)
                log_cluster_operation(
                    "Job Submission",
                    {
                        "job_id": job_id,
                        "script": script_filename,
                        "user": username,
                        "checksum": checksum,
                        "checksum_verified": success,
                    },
                )

                # Keep the script file for reference
                slurm_logger.debug(f"Job script saved at: {script_filename}")
                return job_id

            slurm_logger.error("Failed to submit job to SLURM")
            raise HTTPException(status_code=500, detail="Failed to submit job to SLURM")

        except Exception as e:
            # In case of error, try to clean up the script file
            try:
                pass
            # await self._execute_async_command(f"rm {script_filename}")
            except:
                pass
            raise HTTPException(
                status_code=500, detail=f"Error submitting job: {str(e)}"
            )

    async def get_available_templates(self) -> List[str]:
        """Get list of available job templates."""
        template_dir = settings.TEMPLATE_DIR
        templates = []

        for filename in os.listdir(template_dir):
            if filename.endswith(".template"):
                templates.append(filename)

        cluster_logger.debug(f"Found templates: {templates}")
        return templates

    def read_template(self, template_name: str) -> str:
        """Read content of a template file."""
        template_path = os.path.join(settings.TEMPLATE_DIR, template_name)

        try:
            with open(template_path, "r") as f:
                content = f.read()
                cluster_logger.debug(f"Successfully read template: {template_name}")
                return content
        except FileNotFoundError:
            cluster_logger.error(f"Template not found: {template_name}")
            raise HTTPException(
                status_code=404, detail=f"Template {template_name} not found"
            )
        except Exception as e:
            cluster_logger.error(f"Error reading template {template_name}: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Error reading template: {str(e)}"
            )

    async def fill_template(self, template_name: str, params: Dict[str, str]) -> str:
        """Fill a template with parameters and return the complete script."""
        cluster_logger.debug(
            f"Filling template {template_name} with parameters:\n{params}"
        )
        template_content = self.read_template(template_name)

        # First replace our template parameters
        for key, value in params.items():
            placeholder = f"{{{key}}}"
            template_content = template_content.replace(placeholder, str(value))
            
        # Check for any remaining placeholders that match our format (excluding bash variables)
        remaining = re.findall(r"{[a-zA-Z_]+}", template_content)
        if remaining:
            cluster_logger.error(f"Unfilled placeholders found: {remaining}")
            raise HTTPException(
                status_code=400,
                detail=f"Not all placeholders were replaced in the template: {remaining}",
            )

        cluster_logger.debug("Template successfully filled with all parameters")
        return template_content

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a SLURM job using scancel command."""
        try:
            slurm_logger.debug(f"Cancelling job {job_id}")
            output = await self._execute_async_command(f"scancel {job_id}")
            log_cluster_operation(
                "Job Cancelled",
                {"job_id": job_id, "output": output if output else "No output"},
            )
            return True
        except Exception as e:
            slurm_logger.error(f"Failed to cancel job {job_id}: {str(e)}")
            return False
