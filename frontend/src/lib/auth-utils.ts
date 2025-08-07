/**
 * Auth utilities for handling token expiration and logout
 */

import { toast } from "sonner";

// Global logout function that can be called from anywhere
export const handleTokenExpiration = () => {
  console.log('[Auth] Token expired - triggering automatic logout');
  
  // Clear all auth-related localStorage items
  localStorage.removeItem('auth_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_data');
  localStorage.removeItem('user_data_timestamp');
  localStorage.removeItem('auth_token_expires');
  
  // Clear sessionStorage
  sessionStorage.clear();
  
  // Show notification to user
  toast.error("Sesja wygasła. Wymagane ponowne logowanie.", {
    duration: 8000,
    closeButton: true,
    description: "Zostaniesz przekierowany na stronę logowania."
  });
  
  // Save current path for redirect after login
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    if (currentPath !== '/login' && !currentPath.includes('/logout')) {
      localStorage.setItem('login_redirect', currentPath);
    }
    
    // Force logout through AuthContext if available
    try {
      // Trigger a custom event that AuthContext can listen to
      window.dispatchEvent(new CustomEvent('auth:logout'));
    } catch (error) {
      console.warn('Could not dispatch logout event:', error);
    }
    
    // Delay redirect slightly to allow toast to show
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  }
};

// Check if error is related to token expiration
export const isTokenExpiredError = (error: any): boolean => {
  // Check various error formats that indicate token expiration
  if (error?.response?.status === 401 || error?.response?.status === 403) {
    const errorDetail = error.response.data?.detail;
    if (typeof errorDetail === 'string') {
      return (
        errorDetail.includes("Could not validate credentials") ||
        errorDetail.includes("token expired") ||
        errorDetail.includes("Token expired") ||
        errorDetail.includes("Invalid token") ||
        errorDetail.includes("Unauthorized")
      );
    }
  }
  
  // Check WebSocket close codes that might indicate auth issues
  if (error?.code === 1008 || error?.code === 4001) {
    return true;
  }
  
  return false;
};

// Enhanced error handler for API responses
export const handleApiError = (error: any) => {
  console.log('[Auth] Handling API error:', error);
  
  if (isTokenExpiredError(error)) {
    handleTokenExpiration();
    return true; // Indicates error was handled
  }
  
  return false; // Error was not an auth issue
};
