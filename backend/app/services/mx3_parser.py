"""
MX3 Script Parser Service
Parsuje skrypty .mx3 i wyodrębnia informacje o komendach save, autosave itp.
"""

import re
import os
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class MX3Command:
    """Klasa reprezentująca komendę MX3"""

    def __init__(self, command_type: str, parameters: Dict[str, Any], line_number: int):
        self.command_type = command_type
        self.parameters = parameters
        self.line_number = line_number

    def __repr__(self):
        return (
            f"MX3Command({self.command_type}, {self.parameters}, "
            f"line={self.line_number})"
        )


class MX3ParseResult:
    """Wynik parsowania skryptu MX3"""

    def __init__(self):
        self.save_commands: List[MX3Command] = []
        self.autosave_commands: List[MX3Command] = []
        self.output_commands: List[MX3Command] = []
        self.parameters: Dict[str, Any] = {}
        self.expected_outputs: List[str] = []
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "save_commands": [
                {
                    "type": cmd.command_type,
                    "parameters": cmd.parameters,
                    "line": cmd.line_number,
                }
                for cmd in self.save_commands
            ],
            "autosave_commands": [
                {
                    "type": cmd.command_type,
                    "parameters": cmd.parameters,
                    "line": cmd.line_number,
                }
                for cmd in self.autosave_commands
            ],
            "output_commands": [
                {
                    "type": cmd.command_type,
                    "parameters": cmd.parameters,
                    "line": cmd.line_number,
                }
                for cmd in self.output_commands
            ],
            "parameters": self.parameters,
            "expected_outputs": self.expected_outputs,
            "errors": self.errors,
            "warnings": self.warnings,
        }


class MX3Parser:
    """Parser dla skryptów MX3"""

    def __init__(self):
        # Wzorce regex dla różnych komend MX3
        self.patterns = {
            "save": [
                r"save\s*\(\s*(.+?)\s*\)",
                r"SaveAs\s*\(\s*(.+?)\s*\)",
                r"TableSave\s*\(\s*(.+?)\s*\)",
                r"OutputAs\s*\(\s*(.+?)\s*\)",
            ],
            "autosave": [
                r"autosave\s*\(\s*(.+?)\s*\)",
                r"AutoSave\s*\(\s*(.+?)\s*\)",
                r"TableAutoSave\s*\(\s*(.+?)\s*\)",
            ],
            "output": [
                r"TablePrint\s*\(\s*(.+?)\s*\)",
                r"print\s*\(\s*(.+?)\s*\)",
                r"snapshot\s*\(\s*(.+?)\s*\)",
                r"Snapshot\s*\(\s*(.+?)\s*\)",
            ],
            "parameters": [
                r"(\w+)\s*=\s*(.+)",
                r"Set(\w+)\s*\(\s*(.+?)\s*\)",
                r"(\w+)\s*:=\s*(.+)",
            ],
        }

        # Popularne rozszerzenia plików wyjściowych MX3
        self.output_extensions = {
            ".ovf": "Vectorfield data",
            ".odt": "Table data",
            ".png": "Image snapshot",
            ".jpg": "Image snapshot",
            ".jpeg": "Image snapshot",
            ".gif": "Animation",
            ".svg": "Vector graphics",
            ".dat": "Data file",
            ".txt": "Text data",
            ".csv": "CSV data",
        }

    def parse_file(self, file_path: str) -> MX3ParseResult:
        """Parsuje plik MX3"""
        result = MX3ParseResult()

        try:
            if not os.path.exists(file_path):
                result.errors.append(f"Plik nie istnieje: {file_path}")
                return result

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            return self.parse_content(content)

        except Exception as e:
            result.errors.append(f"Błąd podczas parsowania pliku: {str(e)}")
            logger.error(f"Error parsing MX3 file {file_path}: {e}")

        return result

    def parse_content(self, content: str) -> MX3ParseResult:
        """Parsuje zawartość skryptu MX3"""
        result = MX3ParseResult()

        lines = content.split("\n")

        for line_num, line in enumerate(lines, 1):
            line = line.strip()

            # Pomiń komentarze i puste linie
            if not line or line.startswith("//") or line.startswith("#"):
                continue

            # Parsuj komendy save
            for pattern in self.patterns["save"]:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    cmd = self._parse_save_command(match.group(1), line_num)
                    if cmd:
                        result.save_commands.append(cmd)
                        self._extract_expected_output(cmd, result)
                    break

            # Parsuj komendy autosave
            for pattern in self.patterns["autosave"]:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    cmd = self._parse_autosave_command(match.group(1), line_num)
                    if cmd:
                        result.autosave_commands.append(cmd)
                        self._extract_expected_output(cmd, result)
                    break

            # Parsuj komendy output
            for pattern in self.patterns["output"]:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    cmd = self._parse_output_command(match.group(1), line_num)
                    if cmd:
                        result.output_commands.append(cmd)
                    break

            # Parsuj parametry
            for pattern in self.patterns["parameters"]:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    param_name, param_value = self._parse_parameter(match.groups())
                    if param_name:
                        result.parameters[param_name] = param_value
                    break

        # Walidacja i ostrzeżenia
        self._validate_result(result)

        return result

    def _parse_save_command(self, params: str, line_num: int) -> Optional[MX3Command]:
        """Parsuje komendę save"""
        try:
            # Usuń cudzysłowy i białe znaki
            params = params.strip().strip("\"'")

            # Sprawdź czy to ścieżka pliku
            if "." in params and not params.startswith("("):
                return MX3Command(
                    command_type="save",
                    parameters={"filename": params},
                    line_number=line_num,
                )

            # Parsuj bardziej złożone parametry
            param_dict = self._parse_function_parameters(params)
            return MX3Command(
                command_type="save", parameters=param_dict, line_number=line_num
            )

        except Exception as e:
            logger.warning(f"Failed to parse save command at line {line_num}: {e}")
            return None

    def _parse_autosave_command(
        self, params: str, line_num: int
    ) -> Optional[MX3Command]:
        """Parsuje komendę autosave"""
        try:
            params = params.strip().strip("\"'")

            # Autosave może mieć interval i filename
            if "," in params:
                parts = [p.strip().strip("\"'") for p in params.split(",")]
                return MX3Command(
                    command_type="autosave",
                    parameters={
                        "filename": parts[0],
                        "interval": parts[1] if len(parts) > 1 else None,
                    },
                    line_number=line_num,
                )
            else:
                return MX3Command(
                    command_type="autosave",
                    parameters={"filename": params},
                    line_number=line_num,
                )

        except Exception as e:
            logger.warning(f"Failed to parse autosave command at line {line_num}: {e}")
            return None

    def _parse_output_command(self, params: str, line_num: int) -> Optional[MX3Command]:
        """Parsuje komendę output"""
        try:
            params = params.strip().strip("\"'")

            return MX3Command(
                command_type="output",
                parameters={"content": params},
                line_number=line_num,
            )

        except Exception as e:
            logger.warning(f"Failed to parse output command at line {line_num}: {e}")
            return None

    def _parse_parameter(self, groups: Tuple[str, ...]) -> Tuple[Optional[str], Any]:
        """Parsuje parametr"""
        try:
            if len(groups) >= 2:
                name = groups[0].strip()
                value = groups[1].strip().strip("\"'")

                # Próba konwersji na odpowiedni typ
                try:
                    # Sprawdź czy to liczba
                    if "." in value:
                        return name, float(value)
                    else:
                        return name, int(value)
                except ValueError:
                    # Sprawdź czy to boolean
                    if value.lower() in ["true", "false"]:
                        return name, value.lower() == "true"
                    # Pozostaw jako string
                    return name, value

            return None, None

        except Exception as e:
            logger.warning(f"Failed to parse parameter {groups}: {e}")
            return None, None

    def _parse_function_parameters(self, params: str) -> Dict[str, Any]:
        """Parsuje parametry funkcji"""
        result = {}

        # Prosta implementacja - można rozszerzyć
        parts = params.split(",")
        for i, part in enumerate(parts):
            part = part.strip().strip("\"'")
            if "=" in part:
                key, value = part.split("=", 1)
                result[key.strip()] = value.strip().strip("\"'")
            else:
                result[f"param_{i}"] = part

        return result

    def _extract_expected_output(self, cmd: MX3Command, result: MX3ParseResult):
        """Wyodrębnia oczekiwane pliki wyjściowe z komendy"""
        if "filename" in cmd.parameters:
            filename = cmd.parameters["filename"]

            # Sprawdź rozszerzenie
            ext = Path(filename).suffix.lower()
            if ext in self.output_extensions:
                output_info = f"{filename} ({self.output_extensions[ext]})"
                if output_info not in result.expected_outputs:
                    result.expected_outputs.append(output_info)
            else:
                if filename not in result.expected_outputs:
                    result.expected_outputs.append(filename)

    def _validate_result(self, result: MX3ParseResult):
        """Waliduje wynik parsowania i dodaje ostrzeżenia"""

        # Sprawdź czy są jakieś komendy wyjściowe
        total_commands = (
            len(result.save_commands)
            + len(result.autosave_commands)
            + len(result.output_commands)
        )
        if total_commands == 0:
            result.warnings.append(
                "Nie znaleziono komend wyjściowych (save, autosave, output)"
            )

        # Sprawdź duplikaty nazw plików
        filenames = []
        for cmd in result.save_commands + result.autosave_commands:
            if "filename" in cmd.parameters:
                filename = cmd.parameters["filename"]
                if filename in filenames:
                    result.warnings.append(f"Duplikat nazwy pliku: {filename}")
                else:
                    filenames.append(filename)

        # Sprawdź czy są zdefiniowane podstawowe parametry
        common_params = ["nx", "ny", "nz", "dx", "dy", "dz"]
        missing_params = [p for p in common_params if p not in result.parameters]
        if missing_params:
            result.warnings.append(
                f"Brak typowych parametrów: {', '.join(missing_params)}"
            )

    def get_flow_inputs_outputs(
        self, parse_result: MX3ParseResult
    ) -> Dict[str, List[str]]:
        """Zwraca sugerowane wejścia i wyjścia dla węzła flow"""
        inputs = []
        outputs = []

        # Zawsze dodaj podstawowe wejścia
        inputs.extend(["mx3_script", "parameters"])

        # Dodaj wyjścia na podstawie znalezionych komend
        if parse_result.save_commands:
            outputs.append("save_data")

        if parse_result.autosave_commands:
            outputs.append("autosave_data")

        if parse_result.output_commands:
            outputs.append("output_data")

        # Dodaj konkretne pliki wyjściowe
        for output in parse_result.expected_outputs:
            clean_name = Path(output.split("(")[0].strip()).stem
            outputs.append(f"file_{clean_name}")

        # Dodaj standardowe wyjścia
        outputs.extend(["execution_log", "parameters_used"])

        return {"inputs": inputs, "outputs": outputs}


# Singleton instance
mx3_parser = MX3Parser()
