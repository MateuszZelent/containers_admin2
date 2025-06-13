import axios, { AxiosInstance } from 'axios';
import { toast } from "sonner"; // Dodajemy import toast

// CLI Token Types
export interface CLIToken {
  id: number;
  name: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_used_at?: string;
  last_used_ip?: string;
  last_used_user_agent?: string;
  is_active: boolean;
}

export interface CLITokenCreate {
  name: string;
  expires_days?: number;
}

export interface CLITokenUpdate {
  name?: string;
  expires_days?: number;
}

export interface CLITokenCreateResponse {
  token: string;
  token_info: CLIToken;
}

export interface CLITokenUsageInfo {
  last_used_at?: string;
  last_used_ip?: string;
  last_used_user_agent?: string;
  is_active: boolean;
}

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
        headers: error.config.headers,
        data: error.config.data,
        timeout: error.config.timeout,
        baseURL: error.config.baseURL,
      });
    } else {
      console.error('Axios Request Config: IS UNDEFINED OR NULL');
    }

    if (error.response) {
      console.error('Axios Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data,
      });

      if (error.response.status === 401 || error.response.status === 403) {
        // Sprawdź czy komunikat błędu zawiera "Could not validate credentials"
        const errorDetail = error.response.data?.detail;
        if (typeof errorDetail === 'string' && errorDetail.includes("Could not validate credentials")) {
          console.error('Authentication error: Token invalid or expired');
          
          // Wyloguj użytkownika - wyczyść localStorage
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_data');
          localStorage.removeItem('user_data_timestamp');
          
          // Powiadom użytkownika
          if (typeof window !== "undefined") {
            toast.error("Sesja wygasła. Wymagane ponowne logowanie.", {
              duration: 8000,
              closeButton: true
            });
          }
          
          // Przekieruj na stronę logowania
          if (typeof window !== "undefined") {
            // Zachowaj aktualną ścieżkę, aby móc wrócić po zalogowaniu
            const currentPath = window.location.pathname;
            if (currentPath !== '/login' && !currentPath.includes('/logout')) {
              localStorage.setItem('login_redirect', currentPath);
            }
            
            // Przekieruj na stronę logowania
            window.location.href = '/login';
          }
        }
      } else if (error.response.status === 500) {
        // Specjalna obsługa dla błędu 500
        console.error('INTERNAL SERVER ERROR (500). Response data:', error.response.data);
        // Tutaj możesz wyświetlić użytkownikowi generyczny komunikat
        if (typeof window !== "undefined") {
          toast.error("Wystąpił wewnętrzny błąd serwera. Spróbuj ponownie później.", {
            duration: 8000,
            closeButton: true
          });
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

// Admin API
export const adminApi = {
  // Get all users (admin only)
  getAllUsers: () => apiClient.get('/users/'),
  
  // Get user by ID (admin only)
  getUser: (userId: number) => apiClient.get(`/users/${userId}`),
  
  // Create user (admin only)
  createUser: (userData: {
    username: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    password: string;
    is_active?: boolean;
    is_superuser?: boolean;
  }) => apiClient.post('/users/admin', userData),
  
  // Update user (admin only)
  updateUser: (userId: number, userData: {
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    password?: string;
    is_active?: boolean;
    is_superuser?: boolean;
    max_containers?: number; // Nowa opcja do aktualizacji
    max_gpus?: number; // Nowa opcja do aktualizacji
  }) => apiClient.put(`/users/${userId}`, userData),
  
  // Delete user (admin only)
  deleteUser: (userId: number) => apiClient.delete(`/users/${userId}`),
  
  // Get all jobs from all users (admin only)
  getAllJobs: () => apiClient.get('/jobs/admin/all'),
}

// Jobs API (Containers)
export const jobsApi = {
  // Get all jobs
  getJobs: () => apiClient.get('/jobs/'),
  
  // Get all active jobs (containers + task_queue)
  getActiveAllJobs: () => apiClient.get('/jobs/active-all'),

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
    
  // Check tunnel health
  checkTunnelHealth: (jobId: number, tunnelId: number) => 
    apiClient.post(`/jobs/${jobId}/tunnels/${tunnelId}/health-check`),
};

export const tasksApi = {
  // Get all tasks
  getTasks: (status?: string, skip?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (skip !== undefined) params.append('skip', skip.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    return apiClient.get(`/tasks/?${params.toString()}`);
  },

  // Get active tasks
  getActiveTasks: () => apiClient.get('/tasks/active'),

  // Get task details
  getTask: (taskId: number) => apiClient.get(`/tasks/${taskId}`),

  // Get task status
  getTaskStatus: (taskId: number) => apiClient.get(`/tasks/${taskId}/status`),

  // Submit new task (unified for all task types)
  createTask: (taskData: { [key: string]: any }) => apiClient.post('/tasks/', taskData),
  
  // Get available templates
  getTemplates: () => apiClient.get('/tasks/templates'),

  // Get queue status
  getQueueStatus: () => apiClient.get('/tasks/status'),

  // Get code server URL
  getCodeServerUrl: (taskId: number) => apiClient.get(`/tasks/${taskId}/code-server`),

  // Delete task
  deleteTask: (taskId: number) => apiClient.delete(`/tasks/${taskId}`),

  // Cancel task
  cancelTask: (taskId: string) => apiClient.post(`/tasks/${taskId}/cancel`),

  // Get SSH tunnels for task
  getTaskTunnels: (taskId: number) => apiClient.get(`/tasks/${taskId}/tunnels`),

  // Create SSH tunnel for task
  createTaskTunnel: (taskId: number) => apiClient.post(`/tasks/${taskId}/tunnels`),

  // Close SSH tunnel
  closeTaskTunnel: (taskId: number, tunnelId: number) =>
    apiClient.delete(`/tasks/${taskId}/tunnels/${tunnelId}`),

  // Update task
  updateTask: (taskId: number, taskData: { [key: string]: any }) => 
    apiClient.put(`/tasks/${taskId}`, taskData),
  
  // Get task results (automatically detects type and returns appropriate format)
  getTaskResults: (taskId: number) => apiClient.get(`/tasks/${taskId}/results`),
  
  // Cancel task
  cancelTask: (taskId: string) => apiClient.post(`/tasks/${taskId}/cancel`),
  
  // Process queue
  processQueue: () => apiClient.post('/tasks/process'),

  // Validate simulation file (works for .mx3, .py, and other file types)
  validateFile: (filePath: string) => 
    apiClient.post('/tasks/validate', { file_path: filePath }),
    
  // Get full file content for preview with syntax highlighting
  getFileContent: (filePath: string) => 
    apiClient.get('/tasks/file-content', { params: { file_path: filePath } }),
    
  // Refresh task details (trigger SLURM detail fetch)
  refreshTaskDetails: (taskId: string) => 
    apiClient.post(`/tasks/${taskId}/refresh-details`),
};

// Task Queue API
export const taskQueueApi = {
  // Get all tasks for current user
  getTasks: (status?: string, skip?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (skip !== undefined) params.set('skip', skip.toString());
    if (limit !== undefined) params.set('limit', limit.toString());
    return apiClient.get(`/task-queue/?${params.toString()}`);
  },
  
  // Get specific task
  getTask: (taskId: string) => apiClient.get(`/task-queue/${taskId}`),
  
  // Create new task
  createTask: (taskData: any) => apiClient.post('/task-queue/', taskData),
  
  // Update task
  updateTask: (taskId: string, taskData: any) => 
    apiClient.put(`/task-queue/${taskId}`, taskData),
  
  // Delete task
  deleteTask: (taskId: string) => apiClient.delete(`/task-queue/${taskId}`),
  
  // Get queue status
  getQueueStatus: () => apiClient.get('/task-queue/status'),
  
  // Get active tasks
  getActiveTasks: () => apiClient.get('/task-queue/active'),
  
  // Refresh task details (trigger SLURM detail fetch)
  refreshTaskDetails: (taskId: string) => 
    apiClient.post(`/task-queue/${taskId}/refresh-details`),
  
  // Submit task to SLURM
  submitTask: (taskId: string) => 
    apiClient.post(`/task-queue/${taskId}/submit`),
  
  // Cancel task
  cancelTask: (taskId: string) => 
    apiClient.post(`/task-queue/${taskId}/cancel`),
};

// CLI Tokens API
export const cliTokensApi = {
  // Get all CLI tokens for current user
  getTokens: (): Promise<{ data: CLIToken[] }> => 
    apiClient.get('/cli-tokens/'),
  
  // Create new CLI token
  createToken: (tokenData: CLITokenCreate): Promise<{ data: CLITokenCreateResponse }> => 
    apiClient.post('/cli-tokens/', tokenData),
  
  // Get specific CLI token
  getToken: (tokenId: number): Promise<{ data: CLIToken }> => 
    apiClient.get(`/cli-tokens/${tokenId}`),
  
  // Update CLI token (rename or extend expiration)
  updateToken: (tokenId: number, tokenData: CLITokenUpdate): Promise<{ data: CLIToken }> => 
    apiClient.put(`/cli-tokens/${tokenId}`, tokenData),
  
  // Delete CLI token permanently
  deleteToken: (tokenId: number) => 
    apiClient.delete(`/cli-tokens/${tokenId}`),
  
  // Deactivate CLI token (soft delete)
  deactivateToken: (tokenId: number) => 
    apiClient.post(`/cli-tokens/${tokenId}/deactivate`),
  
  // Get CLI token usage information
  getTokenUsage: (tokenId: number): Promise<{ data: CLITokenUsageInfo }> => 
    apiClient.get(`/cli-tokens/${tokenId}/usage`),
  
  // Cleanup expired tokens (admin only)
  cleanupExpiredTokens: () => 
    apiClient.post('/cli-tokens/cleanup-expired'),
};

// Cluster API
export const clusterApi = {
  // Get current cluster statistics  
  getStats: () => apiClient.get('/cluster/stats'),
  
  // Force update cluster statistics (admin/CLI only)
  updateStats: () => apiClient.post('/cluster/stats/update'),
  
  // Get cluster summary with utilization percentages
  getSummary: () => apiClient.get('/cluster/stats/summary'),
  
  // Get historical cluster statistics
  getStatsHistory: (limit?: number) => 
    apiClient.get(`/cluster/stats/history${limit ? `?limit=${limit}` : ''}`),
  
  // Test cluster stats script execution (admin only)
  testScript: () => apiClient.get('/cluster/stats/test-script'),
};

export default apiClient;