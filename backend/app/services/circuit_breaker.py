"""
Circuit Breaker Pattern Implementation for SLURM Services
Prevents cascading failures when SLURM cluster is unavailable.
"""
from datetime import datetime, timedelta
from enum import Enum
from typing import Callable, Any, Optional
from dataclasses import dataclass
import asyncio

from app.core.logging import cluster_logger


class CircuitBreakerState(str, Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, blocking requests
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerMetrics:
    """Metrics for circuit breaker monitoring"""
    failure_count: int = 0
    success_count: int = 0
    total_requests: int = 0
    state_changes: int = 0
    last_failure_time: Optional[datetime] = None
    last_success_time: Optional[datetime] = None
    current_state: CircuitBreakerState = CircuitBreakerState.CLOSED


class CircuitBreakerException(Exception):
    """Exception raised when circuit breaker is open"""
    def __init__(self, service_name: str, failure_count: int):
        self.service_name = service_name
        self.failure_count = failure_count
        super().__init__(
            f"Circuit breaker is OPEN for {service_name}. "
            f"Failure count: {failure_count}"
        )


class SlurmCircuitBreaker:
    """
    Circuit breaker specifically for SLURM operations.
    
    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Service is failing, requests are blocked
    - HALF_OPEN: Testing if service has recovered
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        success_threshold: int = 2,
        timeout: int = 30
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout  # seconds
        self.success_threshold = success_threshold
        self.timeout = timeout
        
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[datetime] = None
        self._last_success_time: Optional[datetime] = None
        self._next_attempt_time: Optional[datetime] = None
        self._lock: Optional[asyncio.Lock] = None
        
        # Metrics
        self._metrics = CircuitBreakerMetrics()
        
        cluster_logger.info(
            f"SLURM Circuit Breaker initialized: "
            f"failure_threshold={failure_threshold}, "
            f"recovery_timeout={recovery_timeout}s"
        )
    
    def _get_lock(self) -> asyncio.Lock:
        """Get or create the asyncio lock (lazy initialization)"""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock
    
    @property
    def state(self) -> CircuitBreakerState:
        """Get current circuit breaker state"""
        return self._state
    
    @property
    def metrics(self) -> CircuitBreakerMetrics:
        """Get circuit breaker metrics"""
        self._metrics.failure_count = self._failure_count
        self._metrics.success_count = self._success_count
        total_reqs = self._failure_count + self._success_count
        self._metrics.total_requests = total_reqs
        self._metrics.last_failure_time = self._last_failure_time
        self._metrics.last_success_time = self._last_success_time
        self._metrics.current_state = self._state
        return self._metrics
    
    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute a function through the circuit breaker.
        
        Args:
            func: Function to execute
            *args: Arguments to pass to function
            **kwargs: Keyword arguments to pass to function
            
        Returns:
            Result of function execution
            
        Raises:
            CircuitBreakerException: When circuit breaker is open
            Original exception: When function fails
        """
        async with self._get_lock():
            # Check if we should attempt the call
            if not self._should_attempt_call():
                raise CircuitBreakerException("SLURM", self._failure_count)
            
            # If in HALF_OPEN state, only allow limited requests
            if (self._state == CircuitBreakerState.HALF_OPEN and
                    self._success_count >= self.success_threshold):
                # Enough successes to close the circuit
                await self._close_circuit()
        
        # Execute the function with timeout
        try:
            if asyncio.iscoroutinefunction(func):
                result = await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=self.timeout
                )
            else:
                result = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None, func, *args, **kwargs
                    ),
                    timeout=self.timeout
                )
            
            # Success - handle state transitions
            await self._on_success()
            return result
            
        except asyncio.TimeoutError as e:
            cluster_logger.warning("SLURM operation timed out after "
                                   f"{self.timeout}s")
            await self._on_failure()
            raise e
        except Exception as e:
            await self._on_failure()
            raise e
    
    def _should_attempt_call(self) -> bool:
        """Check if we should attempt to call the function"""
        now = datetime.now()
        
        if self._state == CircuitBreakerState.CLOSED:
            return True
        
        if self._state == CircuitBreakerState.OPEN:
            # Check if recovery timeout has passed
            if (self._next_attempt_time and
                    now >= self._next_attempt_time):
                # Transition to HALF_OPEN
                self._state = CircuitBreakerState.HALF_OPEN
                self._success_count = 0
                self._metrics.state_changes += 1
                cluster_logger.info("Circuit breaker -> HALF_OPEN")
                return True
            return False
        
        if self._state == CircuitBreakerState.HALF_OPEN:
            return True
        
        return False
    
    async def _on_success(self):
        """Handle successful function execution"""
        async with self._get_lock():
            self._success_count += 1
            self._last_success_time = datetime.now()
            
            if self._state == CircuitBreakerState.HALF_OPEN:
                if self._success_count >= self.success_threshold:
                    await self._close_circuit()
    
    async def _on_failure(self):
        """Handle failed function execution"""
        async with self._get_lock():
            self._failure_count += 1
            self._last_failure_time = datetime.now()
            
            if self._state == CircuitBreakerState.CLOSED:
                if self._failure_count >= self.failure_threshold:
                    await self._open_circuit()
            
            elif self._state == CircuitBreakerState.HALF_OPEN:
                # Any failure in HALF_OPEN state opens the circuit again
                await self._open_circuit()
    
    async def _open_circuit(self):
        """Open the circuit breaker"""
        self._state = CircuitBreakerState.OPEN
        timeout_delta = timedelta(seconds=self.recovery_timeout)
        recovery_time = datetime.now() + timeout_delta
        self._next_attempt_time = recovery_time
        self._metrics.state_changes += 1
        
        cluster_logger.warning(
            f"Circuit breaker OPENED. Failures: {self._failure_count}. "
            f"Next attempt at: {self._next_attempt_time}"
        )
    
    async def _close_circuit(self):
        """Close the circuit breaker"""
        self._state = CircuitBreakerState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._next_attempt_time = None
        self._metrics.state_changes += 1
        
        cluster_logger.info("Circuit breaker CLOSED - service recovered")
    
    def is_open(self) -> bool:
        """Check if circuit breaker is open (blocking requests)"""
        return self._state == CircuitBreakerState.OPEN
    
    async def record_success(self):
        """Record a successful operation"""
        await self._on_success()
    
    async def record_failure(self):
        """Record a failed operation"""
        await self._on_failure()
    
    async def reset(self):
        """Manually reset the circuit breaker"""
        async with self._get_lock():
            self._state = CircuitBreakerState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._next_attempt_time = None
            self._last_failure_time = None
            self._last_success_time = None
            
            cluster_logger.info("Circuit breaker manually reset")
    
    def get_status(self) -> dict:
        """Get current status for monitoring"""
        return {
            "state": self._state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure": (self._last_failure_time.isoformat()
                             if self._last_failure_time else None),
            "last_success": (self._last_success_time.isoformat()
                             if self._last_success_time else None),
            "next_attempt": (self._next_attempt_time.isoformat()
                             if self._next_attempt_time else None)
        }


# Global circuit breaker instance
_slurm_circuit_breaker: Optional[SlurmCircuitBreaker] = None


def get_slurm_circuit_breaker() -> SlurmCircuitBreaker:
    """Get the global SLURM circuit breaker instance"""
    global _slurm_circuit_breaker
    if _slurm_circuit_breaker is None:
        _slurm_circuit_breaker = SlurmCircuitBreaker()
    return _slurm_circuit_breaker


def init_slurm_circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout: int = 60,
    success_threshold: int = 2,
    timeout: int = 30
) -> SlurmCircuitBreaker:
    """Initialize the global SLURM circuit breaker"""
    global _slurm_circuit_breaker
    _slurm_circuit_breaker = SlurmCircuitBreaker(
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        success_threshold=success_threshold,
        timeout=timeout
    )
    return _slurm_circuit_breaker
