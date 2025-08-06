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
    console.log('--- Axios Error Interceptor Start ---');
    console.log('Error Message:', error.message);
    console.log('Error Name:', error.name);
    console.log('Error Code:', error.code);

    if (error.config) {
      console.log('Axios Request Config:', {
        url: error.config.url,
        method: error.config.method,
        headers: error.config.headers,
        data: error.config.data,
        timeout: error.config.timeout,
        baseURL: error.config.baseURL,
      });
    } else {
      console.log('Axios Request Config: IS UNDEFINED OR NULL');
    }

    if (error.response) {
      console.log('Axios Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data,
      });

      if (error.response.status === 401 || error.response.status === 403) {
        // Sprawdź czy komunikat błędu zawiera "Could not validate credentials"
        const errorDetail = error.response.data?.detail;
        if (typeof errorDetail === 'string' && errorDetail.includes("Could not validate credentials22")) {
          console.log('Authentication error: Token invalid or expired');
          
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
        console.log('INTERNAL SERVER ERROR (500). Response data:', error.response.data);
        // Tutaj możesz wyświetlić użytkownikowi generyczny komunikat
        if (typeof window !== "undefined") {
          toast.error("Wystąpił wewnętrzny błąd serwera. Spróbuj ponownie później.", {
            duration: 8000,
            closeButton: true
          });
        }
      } else {
        console.log('Other API error response. Status:', error.response.status, 'Data:', error.response.data);
      }
    } else if (error.request) {
      console.log('No response received. Request object:', error.request);
    } else {
      console.log('Request setup error (no response, no request).');
    }
    console.log('Error Stack:', error.stack);
    console.log('--- Axios Error Interceptor End ---');

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (username: string, password: string, rememberMe?: boolean) => {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    if (rememberMe !== undefined) {
      params.append("remember_me", String(rememberMe));
    }
    
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
  // Pobiera listę aktywnych użytkowników
  getActiveUsers: () => apiClient.get('/users/active'),
  // Aktualizuje dane bieżącego użytkownika, w tym hasło code_server
  updateCurrentUser: (userData: { 
    code_server_password?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    password?: string;
    preferred_language?: string;
  }) => {
    return apiClient.put('/users/me', userData)
  },
  // Update user language preference
  updateLanguage: (language: string) => {
    return apiClient.put('/users/me/language', {
      preferred_language: language
    })
  },
  // Upload avatar
  uploadAvatar: (formData: FormData) => {
    return apiClient.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
  // Delete avatar
  deleteAvatar: () => apiClient.delete('/users/me/avatar'),
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
    max_containers?: number;
    max_gpus?: number;
    max_gpus_per_job?: number;
    max_time_limit_hours?: number;
    allowed_templates?: string[];
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
    max_containers?: number;
    max_gpus?: number;
    max_gpus_per_job?: number;
    max_time_limit_hours?: number;
    allowed_templates?: string[];
  }) => apiClient.put(`/users/${userId}`, userData),
  
  // Delete user (admin only)
  deleteUser: (userId: number) => apiClient.delete(`/users/${userId}`),
  
  // Get all jobs from all users (admin only)
  getAllJobs: () => apiClient.get('/jobs/admin/all'),
  
  // Resource monitoring endpoints (admin only)
  getMonitoringSettings: () => apiClient.get('/admin/monitoring/status'),
  
  updateMonitoringInterval: (intervalMinutes: number) => 
    apiClient.put('/admin/monitoring/interval', { interval_minutes: intervalMinutes }),
  
  restartMonitoring: () => apiClient.post('/admin/monitoring/restart'),

  // Cluster monitoring endpoints (admin only)
  getClusterMonitoringSettings: () => apiClient.get('/admin/cluster-monitoring/status'),
  
  updateClusterMonitoringInterval: (intervalMinutes: number) => 
    apiClient.put('/admin/cluster-monitoring/interval', { interval_minutes: intervalMinutes }),
  
  restartClusterMonitoring: () => apiClient.post('/admin/cluster-monitoring/restart'),
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
  
  // Get domain status
  getDomainStatus: (jobId: number) => apiClient.get(`/jobs/${jobId}/domain-status`),

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

// Task Queue API
export const taskQueueApi = {
  // Download results as ZIP
  downloadTaskResults: async (taskId: string | number) => {
    try {
      const response = await apiClient.get(`/tasks/${taskId}/download`, {
        responseType: 'blob',
        headers: { 'Accept': 'application/zip' },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  // Get all tasks for current user
  getTasks: (status?: string, skip?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (skip !== undefined) params.set('skip', skip.toString());
    if (limit !== undefined) params.set('limit', limit.toString());
    return apiClient.get(`/tasks/?${params.toString()}`);
  },
  
  // Get active tasks
  getActiveTasks: () => apiClient.get('/tasks/active'),
  
  // Get specific task
  getTask: (taskId: string | number) => apiClient.get(`/tasks/${taskId}`),
  
  // Get task status
  getTaskStatus: (taskId: string | number) => apiClient.get(`/tasks/${taskId}/status`),
  
  // Create new task
  createTask: (taskData: any) => apiClient.post('/tasks/', taskData),
  
  // Update task
  updateTask: (taskId: string | number, taskData: any) => 
    apiClient.put(`/tasks/${taskId}`, taskData),
  
  // Delete task
  deleteTask: (taskId: string) => apiClient.delete(`/tasks/${taskId}`),
  
  // Cancel task
  cancelTask: (taskId: string) => apiClient.post(`/tasks/${taskId}/cancel`),
  
  // Get queue status
  getQueueStatus: () => apiClient.get('/tasks/status'),
  
  // Refresh task details (trigger SLURM detail fetch)
  refreshTaskDetails: (taskId: string) => 
    apiClient.post(`/tasks/${taskId}/refresh-details`),
  
  // Submit task to SLURM
  submitTask: (taskId: string) => 
    apiClient.post(`/tasks/${taskId}/submit`),
  
  // Get task results
  getTaskResults: (taskId: string | number) => apiClient.get(`/tasks/${taskId}/results`),
  
  // Get Amumax results (alias for getTaskResults)
  getAmumaxResults: (taskId: string | number) => apiClient.get(`/tasks/${taskId}/results`),
  
  // Validate file
  validateFile: (filePath: string) => 
    apiClient.post('/tasks/validate', { file_path: filePath }),
    
  // Validate MX3 file specifically
  validateMx3File: (filePath: string) => 
    apiClient.post('/tasks/validate', { file_path: filePath }),
    
  // Get file content for preview
  getFileContent: (filePath: string, options?: { lines?: number }) => 
    apiClient.get('/tasks/file-content', { 
      params: { 
        file_path: filePath,
        ...(options?.lines && { lines: options.lines })
      } 
    }),
  
  // Upload MX3 file
  uploadMx3: (file: File, autoCreateTask: boolean = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('auto_create_task', autoCreateTask.toString());
    return apiClient.post('/tasks/upload-mx3', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // Create Amumax task specifically
  createAmumaxTask: (taskData: {
    name: string;
    mx3_file_path: string;
    description?: string;
    partition?: string;
    num_cpus?: number;
    memory_gb?: number;
    num_gpus?: number;
    time_limit?: string;
    priority?: number;
  }) => {
    // Convert frontend format to backend format
    const backendTaskData = {
      name: `amumax_${taskData.name}`, // Add amumax prefix
      simulation_file: taskData.mx3_file_path, // Backend expects simulation_file
      partition: taskData.partition || "proxima",
      num_cpus: taskData.num_cpus || 4,
      memory_gb: taskData.memory_gb || 16,
      num_gpus: taskData.num_gpus || 1,
      time_limit: taskData.time_limit || "12:00:00",
      priority: taskData.priority || 5,
      parameters: taskData.description ? { description: taskData.description } : {}
    };
    
    return apiClient.post('/tasks/', backendTaskData);
  },
  
  // Process queue
  processQueue: () => apiClient.post('/tasks/process'),
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

  // Get resource usage history
  getUsageHistory: (limit?: number) =>
    apiClient.get(`/cluster/usage/history${limit ? `?limit=${limit}` : ''}`),
  
  // Get optimized resource usage data with intelligent aggregation  
  getOptimizedUsageData: (timeRange: string = '24h') =>
    apiClient.get(`/cluster/usage/optimized?time_range=${timeRange}`),
  
  // Get available time ranges for optimized data
  getTimeRanges: () => apiClient.get('/cluster/usage/time-ranges'),
  
  // Test cluster stats script execution (admin only)
  testScript: () => apiClient.get('/cluster/stats/test-script'),
};

export default apiClient;