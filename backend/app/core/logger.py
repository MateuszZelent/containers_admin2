import logging
import sys
import json
from typing import Dict, Any

class JSONFormatter(logging.Formatter):
    """
    Formatter that outputs JSON strings after parsing the log record.
    """
    def format(self, record: logging.LogRecord) -> str:
        logobj: Dict[str, Any] = {}
        logobj["level"] = record.levelname
        logobj["time"] = self.formatTime(record, self.datefmt)
        logobj["message"] = record.getMessage()
        
        if hasattr(record, "request_id"):
            logobj["request_id"] = record.request_id
            
        if record.exc_info:
            logobj["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(logobj)

def setup_logging(level=logging.INFO):
    """
    Setup logging configuration with specified level
    """
    logger = logging.getLogger("app")
    logger.setLevel(level)
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    
    return logger

# Stwórz główny logger aplikacji
app_logger = setup_logging(level=logging.DEBUG)
