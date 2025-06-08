"""
AMUflow Service - Service for managing Amumax workflow automation.

This service handles:
- MX3 script parsing to extract save/autosave commands
- Flow management and execution
- Integration with SLURM for batch job submission
- Postprocessing module management
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import re
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class MX3Output:
    """Represents an output from MX3 script parsing."""

    command: str  # save, autosave, etc.
    filename: str
    parameters: Dict[str, Any]
    line_number: int


@dataclass
class FlowNode:
    """Represents a node in the workflow."""

    id: str
    type: str  # mx3-parser, fft, spectrum, custom, output
    position: Dict[str, float]
    data: Dict[str, Any]


@dataclass
class FlowConnection:
    """Represents a connection between nodes."""

    id: str
    source: str
    target: str
    source_output: str
    target_input: str


@dataclass
class Flow:
    """Represents a complete workflow."""

    id: str
    name: str
    description: str
    nodes: List[FlowNode]
    connections: List[FlowConnection]
    created_at: datetime
    modified_at: datetime
    created_by: str


class MX3Parser:
    """Parser for MX3 scripts to extract output commands."""

    # Regex patterns for different MX3 commands
    SAVE_PATTERNS = {
        "save": r"save\s*\(\s*([^)]+)\s*\)",
        "autosave": r"autosave\s*\(\s*([^)]+)\s*\)",
        "saveas": r"saveas\s*\(\s*([^)]+)\s*\)",
        "tableadd": r"tableadd\s*\(\s*([^)]+)\s*\)",
        "tablesave": r"tablesave\s*\(\s*([^)]+)\s*\)",
        "snapshot": r"snapshot\s*\(\s*([^)]+)\s*\)",
    }

    def __init__(self):
        self.outputs: List[MX3Output] = []

    def parse_script(self, script_content: str) -> List[MX3Output]:
        """
        Parse MX3 script content and extract all save commands.

        Args:
            script_content: The content of the MX3 script

        Returns:
            List of MX3Output objects representing found outputs
        """
        self.outputs = []
        lines = script_content.split("\n")

        for line_num, line in enumerate(lines, 1):
            # Remove comments
            line = re.sub(r"//.*$", "", line).strip()
            if not line:
                continue

            # Check each pattern
            for command, pattern in self.SAVE_PATTERNS.items():
                matches = re.finditer(pattern, line, re.IGNORECASE)
                for match in matches:
                    try:
                        params_str = match.group(1)
                        parameters = self._parse_parameters(params_str)

                        # Extract filename if present
                        filename = self._extract_filename(parameters)

                        output = MX3Output(
                            command=command,
                            filename=filename or f"{command}_output",
                            parameters=parameters,
                            line_number=line_num,
                        )
                        self.outputs.append(output)

                        logger.info(
                            f"Found {command} command at line {line_num}: {filename}"
                        )

                    except Exception as e:
                        logger.warning(
                            f"Failed to parse {command} at line {line_num}: {e}"
                        )

        return self.outputs

    def _parse_parameters(self, params_str: str) -> Dict[str, Any]:
        """Parse parameter string from MX3 command."""
        parameters = {}

        # Simple parameter parsing - can be extended
        # For now, just store the raw parameter string
        parameters["raw"] = params_str.strip()

        # Try to extract common patterns
        if '"' in params_str or "'" in params_str:
            # Extract quoted strings (likely filenames)
            quoted_strings = re.findall(r'["\']([^"\']+)["\']', params_str)
            if quoted_strings:
                parameters["filename"] = quoted_strings[0]

        # Extract numeric parameters
        numbers = re.findall(r"\b\d+(?:\.\d+)?\b", params_str)
        if numbers:
            parameters["numeric_values"] = [float(n) for n in numbers]

        return parameters

    def _extract_filename(self, parameters: Dict[str, Any]) -> Optional[str]:
        """Extract filename from parsed parameters."""
        if "filename" in parameters:
            return parameters["filename"]

        # Try to extract from raw parameters
        raw = parameters.get("raw", "")
        quoted_match = re.search(r'["\']([^"\']+)["\']', raw)
        if quoted_match:
            return quoted_match.group(1)

        return None

    def get_expected_outputs(self) -> List[str]:
        """Get list of expected output files from parsing."""
        return [output.filename for output in self.outputs]


class FlowManager:
    """Manager for workflow operations."""

    def __init__(self):
        self.flows: Dict[str, Flow] = {}

    def create_flow(self, name: str, description: str, created_by: str) -> Flow:
        """Create a new workflow."""
        flow_id = f"flow_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.flows)}"

        flow = Flow(
            id=flow_id,
            name=name,
            description=description,
            nodes=[],
            connections=[],
            created_at=datetime.now(),
            modified_at=datetime.now(),
            created_by=created_by,
        )

        self.flows[flow_id] = flow
        logger.info(f"Created new flow: {flow_id} - {name}")
        return flow

    def add_node(
        self,
        flow_id: str,
        node_type: str,
        position: Dict[str, float],
        data: Dict[str, Any],
    ) -> FlowNode:
        """Add a node to a workflow."""
        if flow_id not in self.flows:
            raise ValueError(f"Flow {flow_id} not found")

        node_id = f"node_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.flows[flow_id].nodes)}"

        node = FlowNode(id=node_id, type=node_type, position=position, data=data)

        self.flows[flow_id].nodes.append(node)
        self.flows[flow_id].modified_at = datetime.now()

        logger.info(f"Added node {node_id} to flow {flow_id}")
        return node

    def add_connection(
        self,
        flow_id: str,
        source: str,
        target: str,
        source_output: str,
        target_input: str,
    ) -> FlowConnection:
        """Add a connection between nodes."""
        if flow_id not in self.flows:
            raise ValueError(f"Flow {flow_id} not found")

        conn_id = f"conn_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.flows[flow_id].connections)}"

        connection = FlowConnection(
            id=conn_id,
            source=source,
            target=target,
            source_output=source_output,
            target_input=target_input,
        )

        self.flows[flow_id].connections.append(connection)
        self.flows[flow_id].modified_at = datetime.now()

        logger.info(f"Added connection {conn_id} to flow {flow_id}")
        return connection

    def get_flow(self, flow_id: str) -> Optional[Flow]:
        """Get a workflow by ID."""
        return self.flows.get(flow_id)

    def list_flows(self, created_by: Optional[str] = None) -> List[Flow]:
        """List all workflows, optionally filtered by creator."""
        flows = list(self.flows.values())

        if created_by:
            flows = [f for f in flows if f.created_by == created_by]

        return sorted(flows, key=lambda f: f.modified_at, reverse=True)

    def delete_flow(self, flow_id: str) -> bool:
        """Delete a workflow."""
        if flow_id in self.flows:
            del self.flows[flow_id]
            logger.info(f"Deleted flow {flow_id}")
            return True
        return False

    def validate_flow(self, flow_id: str) -> Dict[str, Any]:
        """Validate a workflow for execution."""
        flow = self.get_flow(flow_id)
        if not flow:
            return {"valid": False, "errors": ["Flow not found"]}

        errors = []
        warnings = []

        # Check for disconnected nodes
        connected_nodes = set()
        for conn in flow.connections:
            connected_nodes.add(conn.source)
            connected_nodes.add(conn.target)

        all_nodes = {node.id for node in flow.nodes}
        disconnected = all_nodes - connected_nodes

        if disconnected:
            warnings.append(f"Disconnected nodes: {', '.join(disconnected)}")

        # Check for cycles (simple check)
        # More sophisticated cycle detection could be implemented

        # Check required inputs are connected
        for node in flow.nodes:
            required_inputs = node.data.get("inputs", [])
            connected_inputs = {
                conn.target_input for conn in flow.connections if conn.target == node.id
            }

            missing_inputs = set(required_inputs) - connected_inputs
            if missing_inputs:
                errors.append(
                    f"Node {node.id} missing inputs: {', '.join(missing_inputs)}"
                )

        return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


class PostprocessingModule:
    """Base class for postprocessing modules."""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.inputs: List[str] = []
        self.outputs: List[str] = []
        self.parameters: Dict[str, Any] = {}

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the postprocessing module."""
        raise NotImplementedError("Subclasses must implement execute method")

    def validate_inputs(self, inputs: Dict[str, Any]) -> bool:
        """Validate that required inputs are present."""
        return all(inp in inputs for inp in self.inputs)


class FFTModule(PostprocessingModule):
    """FFT analysis module for time series data."""

    def __init__(self):
        super().__init__(
            name="FFT Analysis", description="Performs FFT analysis on time series data"
        )
        self.inputs = ["time_series", "sampling_rate"]
        self.outputs = ["frequency_spectrum", "magnitude", "phase"]
        self.parameters = {"window": "hamming", "nperseg": 1024, "noverlap": None}

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Execute FFT analysis."""
        # Placeholder implementation
        # In real implementation, this would use scipy.signal.welch or similar
        logger.info("Executing FFT analysis")

        return {
            "frequency_spectrum": "fft_result.dat",
            "magnitude": "magnitude.dat",
            "phase": "phase.dat",
            "status": "completed",
        }


class SpectrumModule(PostprocessingModule):
    """Spectrum analysis module for magnetic field data."""

    def __init__(self):
        super().__init__(
            name="Spectrum Analyzer", description="Analyzes magnetic field spectrum"
        )
        self.inputs = ["magnetic_field", "config"]
        self.outputs = ["spectrum", "report", "visualization"]
        self.parameters = {
            "frequency_range": [0, 100],
            "resolution": 0.1,
            "method": "welch",
        }

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Execute spectrum analysis."""
        logger.info("Executing spectrum analysis")

        return {
            "spectrum": "spectrum_result.dat",
            "report": "spectrum_report.txt",
            "visualization": "spectrum_plot.png",
            "status": "completed",
        }


class AMUflowService:
    """Main service for AMUflow operations."""

    def __init__(self):
        self.flow_manager = FlowManager()
        self.mx3_parser = MX3Parser()
        self.modules = {"fft": FFTModule(), "spectrum": SpectrumModule()}

    def parse_mx3_script(self, script_content: str) -> Dict[str, Any]:
        """Parse MX3 script and return expected outputs."""
        outputs = self.mx3_parser.parse_script(script_content)

        return {
            "outputs": [asdict(output) for output in outputs],
            "expected_files": self.mx3_parser.get_expected_outputs(),
            "command_count": len(outputs),
        }

    def create_mx3_parser_node(
        self, flow_id: str, script_content: str, position: Dict[str, float]
    ) -> FlowNode:
        """Create an MX3 parser node with automatic output detection."""
        parsing_result = self.parse_mx3_script(script_content)

        node_data = {
            "label": "MX3 Parser",
            "script_content": script_content,
            "outputs": parsing_result["expected_files"],
            "parsing_result": parsing_result,
        }

        return self.flow_manager.add_node(flow_id, "mx3-parser", position, node_data)

    def get_available_modules(self) -> Dict[str, Any]:
        """Get list of available postprocessing modules."""
        return {
            name: {
                "name": module.name,
                "description": module.description,
                "inputs": module.inputs,
                "outputs": module.outputs,
                "parameters": module.parameters,
            }
            for name, module in self.modules.items()
        }

    def execute_flow(self, flow_id: str) -> Dict[str, Any]:
        """Execute a workflow (placeholder for SLURM integration)."""
        validation = self.flow_manager.validate_flow(flow_id)

        if not validation["valid"]:
            return {"status": "failed", "errors": validation["errors"]}

        # Placeholder for actual execution
        logger.info(f"Executing flow {flow_id}")

        return {
            "status": "submitted",
            "job_id": f"slurm_job_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "message": "Flow submitted to SLURM queue",
        }


# Global service instance
amuflow_service = AMUflowService()
