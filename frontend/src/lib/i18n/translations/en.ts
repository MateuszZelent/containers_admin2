import { Translation } from '../index';

export const en: Translation = {
  // Common
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    submit: 'Submit',
    search: 'Search',
    filter: 'Filter',
    refresh: 'Refresh',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    finish: 'Finish',
    create: 'Create',
    update: 'Update',
    remove: 'Remove',
    upload: 'Upload',
    download: 'Download',
    copy: 'Copy',
    paste: 'Paste',
    select: 'Select',
    selectAll: 'Select All',
    clear: 'Clear',
    reset: 'Reset',
    apply: 'Apply',
    settings: 'Settings',
    preferences: 'Preferences'
  },

  // Navigation & Menu
  navigation: {
    dashboard: 'Dashboard',
    containers: 'Containers',
    admin: 'Administration',
    settings: 'Settings',
    logout: 'Logout',
    home: 'Home',
    profile: 'Profile',
    help: 'Help',
    support: 'Support'
  },

  // User Settings
  settings: {
    title: 'User Settings',
    account: {
      title: 'Account Settings',
      description: 'Manage your personal information and login password',
      username: 'Username (login)',
      usernameDescription: 'Your username cannot be changed',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email Address',
      password: 'New Password',
      passwordConfirm: 'Confirm New Password',
      passwordSection: 'Change Password (optional)',
      passwordSectionDescription: 'Leave empty if you don\'t want to change password',
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      saved: 'Saved!',
      updateSuccess: 'Account data has been successfully updated',
      updateSuccessWithPassword: 'Account data and password have been successfully updated',
      updateError: 'An error occurred while updating account data'
    },
    avatar: {
      title: 'User Avatar',
      description: 'Manage your profile picture displayed in the system',
      current: 'Your current avatar',
      default: 'Using default avatar with initials',
      upload: 'Upload new avatar',
      uploadDescription: 'Choose JPG, PNG or GIF image. Maximum size: 5MB. Image will be automatically cropped to square and resized.',
      chooseFile: 'Choose File',
      uploading: 'Uploading...',
      deleteAvatar: 'Delete Avatar',
      deleting: 'Deleting...',
      deleteConfirm: 'Delete Avatar',
      deleteDescription: 'Are you sure you want to delete your avatar? It will be replaced with default avatar with initials.',
      uploadSuccess: 'Avatar has been successfully updated!',
      deleteSuccess: 'Avatar has been deleted',
      tips: {
        title: 'Avatar tips:',
        square: 'Best results with square images',
        resize: 'Image will be automatically cropped and resized to 200x200 pixels',
        visible: 'Avatar will be visible to all system users',
        formats: 'Supported formats: JPG, PNG, GIF'
      }
    },
    codeServer: {
      title: 'Code Server Settings',
      description: 'Manage Code Server password used when starting containers',
      currentPassword: 'Current Code Server password:',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      setPassword: 'Set password',
      changePassword: 'Change password',
      newPassword: 'New Code Server password',
      passwordRequirement: 'Password must have at least 5 characters.',
      savePassword: 'Save password',
      updateSuccess: 'Code Server password has been successfully updated',
      updateError: 'An error occurred while updating password',
      info: 'This password will be used to log into Code Server interface in all your containers. We recommend using a strong and unique password.'
    },
    cliTokens: {
      title: 'CLI Tokens',
      description: 'Manage authentication tokens for CLI tools',
      createNew: 'Create new token',
      createTitle: 'Create new CLI token',
      createDescription: 'Create new token for CLI tools authentication',
      tokenName: 'Token name',
      tokenNamePlaceholder: 'e.g. Work laptop, Production server',
      tokenNameDescription: 'Provide descriptive name to easily recognize where you use this token',
      validity: 'Validity (days)',
      validityDescription: 'Token validity period (1-365 days)',
      creating: 'Creating...',
      createToken: 'Create token',
      created: 'Token has been created!',
      createdDescription: 'Copy the token below and save it in a secure place. It won\'t be possible to display it again.',
      copyToken: 'Token copied to clipboard!',
      extend: 'Extend',
      extendTitle: 'Extend token "{{name}}"',
      extendDescription: 'Choose how many days to extend token validity',
      extend30: 'Extend by 30 days',
      extend90: 'Extend by 90 days',
      extend180: 'Extend by 180 days',
      extendSuccess: 'Token has been extended by {{days}} days',
      deleteTitle: 'Delete token',
      deleteDescription: 'Are you sure you want to delete token "{{name}}"? This action cannot be undone and will disable use of this token.',
      deleteSuccess: 'Token "{{name}}" has been deleted',
      noTokens: 'You don\'t have any CLI tokens yet',
      noTokensDescription: 'Create your first token to start using CLI',
      status: {
        active: 'Active',
        inactive: 'Inactive',
        expired: 'Expired',
        expiringSoon: 'Expires in {{days}} days'
      },
      created_: 'Created:',
      expires: 'Expires:',
      lastUsed: 'Last used:',
      neverUsed: 'Never used',
      lastIP: 'Last IP:',
      info: {
        title: 'CLI tokens information:',
        description1: 'CLI tokens enable authentication in command line tools without entering password',
        description2: 'Each token has specific validity period and can be extended or deleted at any time',
        description3: 'Token is displayed only during creation - save it in a secure place',
        description4: 'Monitor last token usage to detect unauthorized access'
      }
    },
    language: {
      title: 'Interface Language',
      description: 'Choose your preferred user interface language',
      current: 'Current language:',
      polish: 'Polski',
      english: 'English',
      change: 'Change Language',
      changeSuccess: 'Interface language has been changed',
      changeError: 'An error occurred while changing language'
    },
    tabs: {
      avatar: 'Avatar',
      account: 'Account Settings',
      codeServer: 'Code-server Settings',
      cliTokens: 'CLI Tokens',
      language: 'Language'
    }
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    welcome: 'Welcome, {{name}}!',
    overview: 'Overview',
    quickActions: 'Quick Actions',
    recentActivity: 'Recent Activity',
    statistics: 'Statistics',
    createContainer: 'Create Container',
    viewContainers: 'View Containers',
    clusterStats: 'Cluster Statistics',
    
    // Statistics cards
    stats: {
      activeContainers: 'Active Containers',
      totalContainers: 'Total Containers',
      usedCPU: 'Used CPU',
      usedRAM: 'Used RAM',
      usedGPU: 'Used GPU',
      availableGPU: 'Available GPU',
      usedStorage: 'Used Storage',
      networkTraffic: 'Network Traffic',
      cpuCores: 'CPU cores',
      memoryGigabytes: 'gigabytes of memory',
      graphicsCards: 'graphics cards',
      storageSpace: 'disk space'
    },
    
    // Empty states
    emptyStates: {
      noActiveContainers: 'No active containers',
      noActiveContainersDescription: 'Create a new container to start working with the computing cluster.',
      createFirstContainer: 'Create first container',
      noData: 'No data',
      loadingData: 'Loading data...',
      errorLoadingData: 'Error loading data'
    },
    
    // Actions
    actions: {
      refresh: 'Refresh',
      create: 'Create',
      delete: 'Delete',
      edit: 'Edit',
      openCodeServer: 'Open Code Server',
      viewLogs: 'View Logs',
      viewDetails: 'View Details',
      running: 'Running',
      pending: 'Pending',
      waitingToStart: 'Waiting to start',
      newContainer: 'New Container'
    },
    
    // Admin panel
    admin: {
      title: 'Administration Panel',
      userManagement: 'User Management',
      userManagementDescription: 'List of all system users',
      users: 'Users',
      totalUsers: 'Users ({{count}})',
      createUser: 'Create User',
      editUser: 'Edit User',
      deleteUser: 'Delete User',
      userDetails: 'User Details',
      adminBadge: 'Admin',
      inactiveBadge: 'Inactive',
      noEmail: 'No email',
      containers: 'Containers: {{current}}/{{max}}',
      gpu: 'GPU: {{current}}/{{max}}',
      lastActive: 'Last active: {{date}}'
    },
    
    // Tasks/Queue
    tasks: {
      title: 'Task Queue',
      active: 'Active Tasks',
      pending: 'Pending Tasks',
      completed: 'Completed Tasks',
      failed: 'Failed Tasks',
      noTasks: 'No tasks',
      createTask: 'Create Task',
      taskDetails: 'Task Details'
    },
    
    // Confirmations and modals
    confirmations: {
      deleteContainer: 'Delete Container',
      deleteContainerDescription: 'Are you sure you want to delete container "{{name}}"?\n\nContainer information:\n• ID: {{id}}\n• Status: {{status}}\n• Template: {{template}}\n• CPU: {{cpu}}, RAM: {{ram}}GB, GPU: {{gpu}}\n• Created: {{created}}\n\nThis operation is irreversible.',
      confirmDelete: 'Delete Container',
      cancel: 'Cancel',
      deleteUserConfirm: 'Are you sure you want to delete this user? This operation is irreversible.',
      userDeletedSuccess: 'User has been deleted successfully',
      containerDeletedSuccess: 'Container has been deleted'
    },

    // Task management panel
    taskManagement: {
      title: 'Task Management Panel',
      autoRefresh: {
        on: 'Auto On',
        off: 'Auto Off'
      },
      refreshButton: 'Refresh',
      settings: 'Settings'
    },

    // Cluster status
    clusterStatus: {
      title: 'PCSS Cluster Connection Status',
      checking: 'Checking cluster status...',
      cannotGetStatus: 'Cannot get cluster status',
      noResponse: 'No response from server. Check your network connection or contact administrator.',
      sshConnection: 'SSH Connection',
      websocketConnection: 'WebSocket Connection',
      websocketVerification: 'WebSocket Verification',
      active: 'Active',
      inactive: 'Inactive',
      containerCreationDisabled: 'Container creation is impossible - cluster is unavailable',
      noServerResponse: 'No response from server when trying to get tunnels for job {{jobId}}.'
    },

    // Tabs
    tabs: {
      activeTasks: 'Active Tasks',
      taskQueue: 'Task Queue',
      completedTasks: 'Completed Tasks',
      adminPanel: 'Admin Panel'
    },

    // Task sections
    taskSections: {
      activeTasks: 'Active Tasks',
      activeTasksTitle: 'Active Tasks'
    }
  },

  // Containers
  containers: {
    title: 'Containers',
    create: 'Create Container',
    manage: 'Manage Containers',
    status: 'Status',
    actions: 'Actions',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    logs: 'Logs',
    terminal: 'Terminal',
    details: 'Details',
    
    // Container creation form
    create_form: {
      title: 'Container Configuration',
      subtitle: 'Fill out the form to create a new computational container',
      creating_container: 'Creating container...',
      error_creating_container: 'An error occurred while creating the container',
      error_creating_container_toast: 'Error creating container',
      back_to_dashboard: 'Back to dashboard',
      
      // Form sections
      basic_info: {
        title: 'Basic Information',
        container_name: 'Container Name',
        container_name_placeholder: 'e.g. tensorflow_training_2024',
        container_name_description: 'Unique name identifying the container (letters, numbers, _ and - only)',
        container_name_format: 'Name can only contain letters, numbers, _ and -',
        container_name_min_error: 'Name must be at least 3 characters',
        container_name_max_error: 'Name cannot exceed 100 characters',
        container_name_regex_error: 'Name can only contain letters, numbers, _ and -'
      },
      
      template_config: {
        title: 'Template Configuration',
        template_label: 'Container Template',
        template_placeholder_loading: 'Loading templates...',
        template_placeholder: 'Select container template',
        template_required: 'Template is required',
        template_not_allowed: 'You do not have permission for this template',
        template_description: 'templates available for your account',
        template_loading: 'Loading available templates',
        template_error: 'Error loading templates',
        template_loaded: 'Loaded {{count}} templates',
        no_templates: 'No available templates',
        loading_templates: 'Loading available templates',
        loading_templates_ellipsis: 'Loading available templates...',
        last_used: 'Last used',
        never_used: 'Never used',
        available_templates: 'Available templates: {{templates}}',
        templates_available_for_account: '{{count}} templates available for your account',
        cannot_load_templates_list: 'Cannot load list of available templates'
      },
      
      runtime_config: {
        environment_settings: 'Container Environment',
        select_template_to_continue: 'Select template to continue'
      },
      
      resources: {
        title: 'Resource Configuration',
        subtitle: 'Define hardware requirements for the container',
        hardware_requirements_description: 'Define hardware requirements for the container',
        partition: 'Partition',
        partition_placeholder: 'Select computational partition',
        partition_proxima: 'Proxima (GPU)',
        time_limit: 'Time Limit',
        time_limit_placeholder: 'Select maximum runtime',
        time_limit_max_error: 'Maximum {hours}h for your account',
        hardware_resources: 'Hardware Resources',
        hardware_title: 'Hardware Resources',
        cpu_cores: 'CPU (cores)',
        cpu_label: 'CPU (cores)',
        cpu_placeholder: 'Select CPU',
        cpu_description: '4-48 processor cores',
        memory_gb: 'RAM (GB)',
        memory_label: 'RAM (GB)',
        memory_placeholder: 'Select RAM',
        memory_description: '8-512 GB memory',
        gpu_count: 'GPU',
        gpu_label: 'GPU',
        gpu_placeholder: 'Select GPU count',
        gpu_description: '0-{{max}} available',
        no_gpu_available: 'No available GPU',
        max_label: 'max',
        gpu_max_error: 'Maximum {count} GPU for your account',
        gpu_no_available: 'No available GPU'
      },
      
      time_options: {
        '1_hour': '1 hour',
        '6_hours': '6 hours',
        '12_hours': '12 hours',
        '24_hours': '24 hours',
        '3_days': '3 days',
        '7_days': '7 days'
      },
      cpu_options: {
        '4_cores': '4 cores',
        '8_cores': '8 cores',
        '12_cores': '12 cores',
        '16_cores': '16 cores',
        '20_cores': '20 cores',
        '24_cores': '24 cores',
        '28_cores': '28 cores',
        '32_cores': '32 cores',
        '36_cores': '36 cores',
        '40_cores': '40 cores',
        '44_cores': '44 cores',
        '48_cores': '48 cores'
      },
      
      validation: {
        config_issues: 'Configuration issues detected:',
        gpu_limit_exceeded: 'GPU per container limit exceeded ({{limit}}). Requested: {{requested}}',
        time_limit_exceeded: 'Container lifetime limit exceeded ({{limit}}h). Requested: {{requested}}h',
        template_not_allowed: 'You do not have permission to use template: {{template}}',
        invalid_time_format: 'Invalid time format',
        invalid_time_format_container: 'Invalid container lifetime format',
        no_template_permission: 'You do not have permission for this template',
        max_gpus_for_account: 'Maximum {{max}} GPU for your account',
        max_time_for_account: 'Maximum {{max}}h for your account',
        no_template_permission_warning: 'You do not have permission to use template: {{template}}',
        invalid_time_format_warning: 'Invalid container lifetime format'
      },
      
      submit: {
        create_container: 'Create Container',
        creating: 'Creating container...',
        fix_errors: 'Fix configuration errors',
        fix_configuration_errors: 'Fix configuration errors',
        complete_fields: 'Complete required fields',
        complete_required_fields: 'Complete required fields',
        configuration_issues_detected: 'Configuration issues detected:',
        cannot_create_container: 'Cannot create container',
        success: 'Container created successfully!',
        error: 'Error creating container',
        general_error: 'An error occurred while creating container'
      },
      
      // Sidebar cards
      permissions: {
        title: 'Your Permissions',
        subtitle: 'Overview of available limits and templates',
        gpu_per_container: 'GPU per container',
        gpu_per_container_desc: 'Maximum number',
        max_time: 'Maximum time',
        max_time_desc: 'Container lifetime',
        available_templates: 'Available templates',
        available_templates_desc: 'Allowed environments'
      },
      
      summary: {
        title: 'Configuration Summary',
        subtitle: 'Overview of selected parameters',
        configuration_summary: 'Configuration Summary',
        selected_parameters_overview: 'Overview of selected parameters',
        partition: 'Partition',
        proxima_gpu: 'Proxima (GPU)',
        gpu_hardware_spec: 'Nvidia Tesla H100 98 GB RAM • GPU Computing',
        partition_info: 'Nvidia Tesla H100 98 GB RAM • GPU Computing',
        hardware_resources: 'Hardware Resources',
        hardware_title: 'Hardware Resources',
        time_label: 'Time',
        maximum: 'maximum',
        core_singular: 'core',
        cores_few: 'cores',
        cores_many: 'cores',
        memory_unit: 'GB memory',
        no_gpu: 'no GPU',
        gpu_singular: 'GPU card',
        gpu_plural: 'GPU cards',
        container_template: 'Container Template',
        no_template_selected: 'No template selected',
        not_selected: 'No template selected',
        select_to_continue: 'Select template to continue',
        container_environment: 'Container environment',
        cpu_unit: 'core|cores|cores',
        gpu_unit: 'no GPU|GPU card|GPU cards',
        time_unit: 'maximum'
      },
      
      info: {
        title: 'Information',
        container_created_with_template: 'Container will be created with selected template',
        resources_reserved_by_spec: 'Resources will be reserved according to specification',
        automatic_lifecycle_management: 'Automatic container lifecycle management',
        time_limit_defines_max_runtime: 'Time limit defines maximum runtime'
      },
      
      user_limits: {
        title: 'Your Permissions',
        description: 'Overview of available limits and templates',
        gpu_per_container: 'GPU per container',
        maximum_count: 'Maximum count',
        max_time: 'Maximum time',
        container_lifetime: 'Container lifetime',
        available_templates: 'Available templates',
        allowed_environments: 'Allowed environments'
      },
      
      info_card: {
        title: 'Information',
        info1: 'Container will be created with selected template',
        info2: 'Resources will be reserved according to specifications',
        info3: 'Automatic container lifecycle management',
        warning1: 'Time limit determines maximum runtime'
      }
    }
  },

  // Authentication
  auth: {
    login: 'Login',
    logout: 'Logout',
    username: 'Username',
    password: 'Password',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot password?',
    loginButton: 'Sign In',
    loginError: 'Login error',
    loginSuccess: 'Logged in successfully',
    logoutSuccess: 'Logged out successfully'
  },

  // Errors
  errors: {
    generic: 'An unexpected error occurred',
    network: 'Network connection error',
    notFound: 'Not found',
    unauthorized: 'Unauthorized',
    forbidden: 'Access forbidden',
    serverError: 'Internal server error',
    validation: 'Data validation error',
    retry: 'Try again',
    failedToFetchJobs: 'Failed to fetch jobs list',
    failedToFetchAdminData: 'Failed to fetch administrative data',
    failedToDeleteContainer: 'Failed to delete container',
    failedToDeleteUser: 'Failed to delete user',
    cannotLoadUserData: 'Cannot load user data',
    cannotLoadTemplates: 'Cannot load container templates',
    cannotCreateContainer: 'Cannot create container'
  },

  // Task Queue & Amumax Tasks
  tasks: {
    submit_form: {
      title: 'New Amumax Task',
      subtitle: 'Create a micromagnetic simulation task',
      
      basic_info: {
        title: 'Basic Information',
        task_name: 'Task Name',
        task_name_placeholder: 'e.g. magnetization_dynamics_2024',
        task_name_description: 'Unique name identifying the task (letters, numbers, _ and - only)',
        description: 'Description (optional)',
        description_placeholder: 'Additional information about the simulation...'
      },
      
      file_config: {
        title: 'File Configuration',
        mx3_file_path: 'Path to .mx3 file',
        mx3_file_path_placeholder: '/mnt/local/username/simulation.mx3',
        mx3_file_path_description: 'Full path to Amumax script file (.mx3). Validation will run after you finish typing or click outside the field.'
      },
      
      resources: {
        title: 'Resource Configuration',
        partition: 'Partition',
        partition_placeholder: 'Select partition',
        time_limit: 'Time Limit',
        time_limit_placeholder: 'Select time limit',
        cpu_cores: 'CPU (cores)',
        cpu_description: '1-32 CPU cores',
        memory_gb: 'RAM (GB)',
        memory_description: '1-128 GB RAM',
        gpu: 'GPU',
        gpu_description: '0-4 GPUs',
        priority: 'Task Priority',
        priority_description: '1-10, higher priority = earlier execution in queue'
      },
      
      validation: {
        name_min: 'Name must be at least 3 characters',
        name_max: 'Name cannot exceed 100 characters',
        name_format: 'Name can only contain letters, numbers, _ and -',
        file_path_required: 'Path to .mx3 file is required',
        file_extension: 'File must have .mx3 extension',
        description_max: 'Description cannot exceed 500 characters'
      },
      
      validation_steps: {
        checking_file_exists: 'Checking file existence',
        checking_permissions: 'Checking permissions',
        validating_content: 'Validating .mx3 content',
        generating_preview: 'Generating preview'
      }
    }
  },

  // Time and dates
  time: {
    now: 'now',
    today: 'today',
    yesterday: 'yesterday',
    tomorrow: 'tomorrow',
    thisWeek: 'this week',
    lastWeek: 'last week',
    thisMonth: 'this month',
    lastMonth: 'last month',
    daysAgo: '{{count}} days ago',
    hoursAgo: '{{count}} hours ago',
    minutesAgo: '{{count}} minutes ago'
  }
};
