/**
 * Utility functions for handling API errors in a React-safe way
 */

export interface ApiError {
  message?: string;
  msg?: string;  // Pydantic validation error format
  detail?: string | object;
  type?: string;
  loc?: string[];
  input?: any;
  ctx?: any;
}

/**
 * Safely extracts error message from API response error
 * Handles various error formats (string, validation errors array, etc.)
 */
export function extractErrorMessage(error: any, defaultMessage = "Wystąpił nieoczekiwany błąd"): string {
  console.error('API Error:', error);
  
  if (!error.response?.data) {
    return defaultMessage;
  }
  
  const data = error.response.data;
  
  // Handle string detail
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  
  // Handle validation errors array (Pydantic/FastAPI format)
  if (Array.isArray(data.detail)) {
    const validationErrors = data.detail.map((err: ApiError) => {
      if (typeof err === 'string') return err;
      
      if (err.msg && err.loc) {
        const field = Array.isArray(err.loc) ? err.loc.join('.') : err.loc;
        return `${field}: ${err.msg}`;
      }
      
      return err.msg || err.message || 'Błąd walidacji';
    });
    
    return validationErrors.join(', ');
  }
  
  // Handle other error formats
  if (data.message) {
    return data.message;
  }
  
  if (data.error) {
    return data.error;
  }
  
  return defaultMessage;
}

/**
 * Safe error handler for toast notifications
 * Ensures that objects are never passed to toast.error()
 */
export function handleApiError(error: any, defaultMessage = "Wystąpił nieoczekiwany błąd"): string {
  const message = extractErrorMessage(error, defaultMessage);
  
  // Ensure we never return an object or complex type
  if (typeof message !== 'string') {
    console.warn('Error message is not a string:', message);
    return defaultMessage;
  }
  
  return message;
}

/**
 * Extract field-specific validation errors
 * Returns an object with field names as keys and error messages as values
 */
export function extractValidationErrors(error: any): Record<string, string> {
  const errors: Record<string, string> = {};
  
  if (!error.response?.data?.detail || !Array.isArray(error.response.data.detail)) {
    return errors;
  }
  
  error.response.data.detail.forEach((err: ApiError) => {
    if (err.loc && err.msg) {
      const field = Array.isArray(err.loc) ? err.loc.join('.') : String(err.loc);
      errors[field] = err.msg;
    }
  });
  
  return errors;
}
