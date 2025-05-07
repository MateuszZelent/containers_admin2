import axios, { AxiosInstance } from 'axios';

// Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://amucontainers.orion.zfns.eu.org";
const API_PREFIX = "/api/v1";

// Create a single axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}${API_PREFIX}`,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    
    // Ensure credentials are always included
    config.withCredentials = true;
    
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Remove duplicate response interceptors and implement a single consolidated one
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('--- Axios Error Interceptor Start ---');
    console.error('Error Message:', error.message);
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);

    if (error.config) {
      console.error('Axios Request Config:', {
        url: error.config.url,
        method: error.config.method,
        headers: error.config.headers, // Może być duże, ale ważne
        data: error.config.data,       // Dane wysłane z żądaniem
        timeout: error.config.timeout,
        baseURL: error.config.baseURL,
        // Możesz dodać inne interesujące Cię pola z config
      });
    } else {
      console.error('Axios Request Config: IS UNDEFINED OR NULL');
    }

    if (error.response) {
      console.error('Axios Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers, // Nagłówki odpowiedzi
        data: error.response.data,       // Ciało odpowiedzi (tutaj będzie błąd z serwera)
      });

      if (error.response.status === 401 || error.response.status === 403) {
        // ... (twoja logika przekierowania)
      } else if (error.response.status === 500) {
        // Specjalna obsługa dla błędu 500
        console.error('INTERNAL SERVER ERROR (500). Response data:', error.response.data);
        // Tutaj możesz wyświetlić użytkownikowi generyczny komunikat
        if (typeof window !== "undefined") {
          toast.error("Wystąpił wewnętrzny błąd serwera. Spróbuj ponownie później.");
        }
      } else {
        console.error('Other API error response. Status:', error.response.status, 'Data:', error.response.data);
      }
    } else if (error.request) {
      console.error('No response received. Request object:', error.request);
    } else {
      console.error('Request setup error (no response, no request).');
    }
    console.error('Error Stack:', error.stack);
    console.error('--- Axios Error Interceptor End ---');

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    
    try {
      const response = await apiClient.post(`/auth/login`, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      
      if (response.data.access_token) {
        localStorage.setItem("auth_token", response.data.access_token);
      }
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  
  async logout() {
    try {
      // Najpierw próbujemy wywołać endpoint wylogowania po stronie serwera
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include', // ważne aby wysłać cookies
      });
    } catch (error) {
      console.error('Backend logout failed:', error);
    }
    
    // Wyczyść localStorage
    localStorage.clear(); // Czyści całe localStorage zamiast tylko jednego klucza
    
    // Wyczyść sessionStorage
    sessionStorage.clear();
    
    // Wyczyść wszystkie cookies
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.trim().split('=');
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
    });
    
    // Resetuj stan Axios jeśli używany
    // Remove Authorization header from the apiClient instance
    delete apiClient.defaults.headers.common['Authorization'];
    
    return true;
  },
  
  isAuthenticated() {
    // Logujemy wszystkie klucze w localStorage do celów debugowania
    console.log('All localStorage keys:', Object.keys(localStorage));
    
    // Sprawdzamy różne możliwe nazwy tokenów
    const auth_token = localStorage.getItem('auth_token');
    const token = localStorage.getItem('token');
    const jwt = localStorage.getItem('jwt');
    const accessToken = localStorage.getItem('accessToken');
    
    console.log('Potential tokens found:', { auth_token, token, jwt, accessToken });
    
    // Zwracamy true, jeśli którykolwiek token istnieje
    return !!(auth_token || token || jwt || accessToken);
  },
  
// Zmodyfikuj funkcję logout, aby była bardziej skuteczna
  };

// User API
export const userApi = {
  // Pobiera dane bieżącego użytkownika
  getCurrentUser: () => apiClient.get('/users/me'),
  // Aktualizuje dane bieżącego użytkownika, w tym hasło code_server
  updateCurrentUser: (userData: { code_server_password?: string }) => {
    return apiClient.put('/users/me', userData)
  },
}

export const jobsApi = {
  // Get all jobs
  getJobs: () => apiClient.get('/jobs/'),
  
  // Get active jobs
  getActiveJobs: () => apiClient.get('/jobs/active-jobs'),
  
  // Get job details
  getJob: (jobId: number) => apiClient.get(`/jobs/${jobId}`),
  
  // Get job status
  getJobStatus: (jobId: number) => apiClient.get(`/jobs/${jobId}/status`),
  
  // Submit new job
  createJob: (jobData: { [key: string]: any }) => apiClient.post('/jobs/', jobData),
  
  // Get available templates
  getTemplates: () => apiClient.get('/jobs/templates'),
  
  // Check cluster status
  getClusterStatus: () => apiClient.get('/jobs/status'),
  
  // Get code server URL
  getCodeServerUrl: (jobId: number) => apiClient.get(`/jobs/${jobId}/code-server`),

  // Delete job
  deleteJob: (jobId: number) => apiClient.delete(`/jobs/${jobId}`),
  
  // Get SSH tunnels for job
  getJobTunnels: (jobId: number) => apiClient.get(`/jobs/${jobId}/tunnels`),
  
  // Create SSH tunnel for job
  createJobTunnel: (jobId: number) => apiClient.post(`/jobs/${jobId}/tunnels`),
  
  // Close SSH tunnel
  closeJobTunnel: (jobId: number, tunnelId: number) => 
    apiClient.delete(`/jobs/${jobId}/tunnels/${tunnelId}`),
};

export default apiClient;