import { Translation } from '../index';

export const pl: Translation = {
  // Common
  common: {
    save: 'Zapisz',
    cancel: 'Anuluj',
    delete: 'Usuń',
    edit: 'Edytuj',
    close: 'Zamknij',
    loading: 'Ładowanie...',
    error: 'Błąd',
    success: 'Sukces',
    confirm: 'Potwierdź',
    yes: 'Tak',
    no: 'Nie',
    submit: 'Wyślij',
    search: 'Szukaj',
    filter: 'Filtruj',
    refresh: 'Odśwież',
    back: 'Wstecz',
    next: 'Dalej',
    previous: 'Wstecz',
    finish: 'Zakończ',
    create: 'Utwórz',
    update: 'Aktualizuj',
    remove: 'Usuń',
    upload: 'Prześlij',
    download: 'Pobierz',
    copy: 'Kopiuj',
    paste: 'Wklej',
    select: 'Wybierz',
    selectAll: 'Zaznacz wszystko',
    clear: 'Wyczyść',
    reset: 'Zresetuj',
    apply: 'Zastosuj',
    settings: 'Ustawienia',
    preferences: 'Preferencje'
  },

  // Navigation & Menu
  navigation: {
    dashboard: 'Panel główny',
    containers: 'Kontenery',
    admin: 'Administracja',
    settings: 'Ustawienia',
    logout: 'Wyloguj',
    home: 'Strona główna',
    profile: 'Profil',
    help: 'Pomoc',
    support: 'Wsparcie'
  },

  // User Settings
  settings: {
    title: 'Ustawienia użytkownika',
    account: {
      title: 'Ustawienia konta',
      description: 'Zarządzaj swoimi danymi osobowymi i hasłem do logowania',
      username: 'Login (nazwa użytkownika)',
      usernameDescription: 'Twój login nie może zostać zmieniony',
      firstName: 'Imię',
      lastName: 'Nazwisko',
      email: 'Adres email',
      password: 'Nowe hasło',
      passwordConfirm: 'Potwierdź nowe hasło',
      passwordSection: 'Zmiana hasła (opcjonalnie)',
      passwordSectionDescription: 'Pozostaw puste, jeśli nie chcesz zmieniać hasła',
      saveChanges: 'Zapisz zmiany',
      saving: 'Zapisywanie...',
      saved: 'Zapisano!',
      updateSuccess: 'Dane konta zostały pomyślnie zaktualizowane',
      updateSuccessWithPassword: 'Dane konta oraz hasło zostały pomyślnie zaktualizowane',
      updateError: 'Wystąpił błąd podczas aktualizacji danych konta'
    },
    avatar: {
      title: 'Avatar użytkownika',
      description: 'Zarządzaj swoim zdjęciem profilowym wyświetlanym w systemie',
      current: 'Twój aktualny avatar',
      default: 'Używasz domyślnego avatara z inicjałami',
      upload: 'Prześlij nowy avatar',
      uploadDescription: 'Wybierz obraz JPG, PNG lub GIF. Maksymalny rozmiar: 5MB. Obraz zostanie automatycznie przycięty do kwadratu i przeskalowany.',
      chooseFile: 'Wybierz plik',
      uploading: 'Przesyłanie...',
      deleteAvatar: 'Usuń avatar',
      deleting: 'Usuwanie...',
      deleteConfirm: 'Usuń avatar',
      deleteDescription: 'Czy na pewno chcesz usunąć swój avatar? Zostanie zastąpiony domyślnym avatarem z inicjałami.',
      uploadSuccess: 'Avatar został pomyślnie zaktualizowany!',
      deleteSuccess: 'Avatar został usunięty',
      tips: {
        title: 'Wskazówki dotyczące avatara:',
        square: 'Najlepsze rezultaty uzyskasz używając kwadratowych obrazów',
        resize: 'Obraz zostanie automatycznie przycięty i przeskalowany do 200x200 pikseli',
        visible: 'Avatar będzie widoczny dla wszystkich użytkowników systemu',
        formats: 'Obsługiwane formaty: JPG, PNG, GIF'
      }
    },
    codeServer: {
      title: 'Ustawienia Code Server',
      description: 'Zarządzaj hasłem do Code Server używanym przy uruchamianiu kontenerów',
      currentPassword: 'Bieżące hasło Code Server:',
      showPassword: 'Pokaż hasło',
      hidePassword: 'Ukryj hasło',
      setPassword: 'Ustaw hasło',
      changePassword: 'Zmień hasło',
      newPassword: 'Nowe hasło Code Server',
      passwordRequirement: 'Hasło musi mieć co najmniej 5 znaków.',
      savePassword: 'Zapisz hasło',
      updateSuccess: 'Hasło Code Server zostało pomyślnie zaktualizowane',
      updateError: 'Wystąpił błąd podczas aktualizacji hasła',
      info: 'To hasło będzie używane do logowania do interfejsu Code Server we wszystkich Twoich kontenerach. Zalecamy użycie silnego i unikalnego hasła.'
    },
    cliTokens: {
      title: 'Tokeny CLI',
      description: 'Zarządzaj tokenami uwierzytelniania dla narzędzi CLI',
      createNew: 'Utwórz nowy token',
      createTitle: 'Utwórz nowy token CLI',
      createDescription: 'Utwórz nowy token do uwierzytelniania w narzędziach CLI',
      tokenName: 'Nazwa tokenu',
      tokenNamePlaceholder: 'np. Laptop do pracy, Serwer produkcyjny',
      tokenNameDescription: 'Podaj opisową nazwę, aby łatwo rozpoznać, gdzie używasz tego tokenu',
      validity: 'Ważność (dni)',
      validityDescription: 'Czas ważności tokenu (1-365 dni)',
      creating: 'Tworzenie...',
      createToken: 'Utwórz token',
      created: 'Token został utworzony!',
      createdDescription: 'Skopiuj poniższy token i zapisz go w bezpiecznym miejscu. Nie będzie możliwe ponowne jego wyświetlenie.',
      copyToken: 'Token skopiowany do schowka!',
      extend: 'Przedłuż',
      extendTitle: 'Przedłuż token "{{name}}"',
      extendDescription: 'Wybierz o ile dni przedłużyć ważność tokenu',
      extend30: 'Przedłuż o 30 dni',
      extend90: 'Przedłuż o 90 dni',
      extend180: 'Przedłuż o 180 dni',
      extendSuccess: 'Token został przedłużony o {{days}} dni',
      deleteTitle: 'Usuń token',
      deleteDescription: 'Czy na pewno chcesz usunąć token "{{name}}"? Ta akcja nie może zostać cofnięta i uniemożliwi korzystanie z tego tokenu.',
      deleteSuccess: 'Token "{{name}}" został usunięty',
      noTokens: 'Nie masz jeszcze żadnych tokenów CLI',
      noTokensDescription: 'Utwórz pierwszy token, aby rozpocząć korzystanie z CLI',
      status: {
        active: 'Aktywny',
        inactive: 'Nieaktywny',
        expired: 'Wygasł',
        expiringSoon: 'Wygasa za {{days}} dni'
      },
      created_: 'Utworzony:',
      expires: 'Wygasa:',
      lastUsed: 'Ostatnie użycie:',
      neverUsed: 'Nigdy nie używany',
      lastIP: 'Ostatnie IP:',
      info: {
        title: 'Informacje o tokenach CLI:',
        description1: 'Tokeny CLI umożliwiają uwierzytelnianie w narzędziach wiersza poleceń bez podawania hasła',
        description2: 'Każdy token ma określony czas ważności i może być przedłużony lub usunięty w dowolnym momencie',
        description3: 'Token jest wyświetlany tylko podczas tworzenia - zapisz go w bezpiecznym miejscu',
        description4: 'Monitoruj ostatnie użycie tokenów, aby wykryć nieautoryzowany dostęp'
      }
    },
    language: {
      title: 'Język interfejsu',
      description: 'Wybierz preferowany język interfejsu użytkownika',
      current: 'Aktualny język:',
      polish: 'Polski',
      english: 'English',
      change: 'Zmień język',
      changeSuccess: 'Język interfejsu został zmieniony',
      changeError: 'Wystąpił błąd podczas zmiany języka'
    },
    tabs: {
      avatar: 'Avatar',
      account: 'Ustawienia konta',
      codeServer: 'Ustawienia Code-server',
      cliTokens: 'Tokeny CLI',
      language: 'Język'
    }
  },

  // Dashboard
  dashboard: {
    title: 'Panel główny',
    welcome: 'Witaj, {{name}}!',
    overview: 'Przegląd',
    quickActions: 'Szybkie akcje',
    recentActivity: 'Ostatnia aktywność',
    statistics: 'Statystyki',
    createContainer: 'Utwórz kontener',
    viewContainers: 'Zobacz kontenery',
    clusterStats: 'Statystyki klastra',
    
    // Statistics cards
    stats: {
      activeContainers: 'Aktywne kontenery',
      totalContainers: 'Kontenery razem',
      usedCPU: 'Używane CPU',
      usedRAM: 'Używana pamięć RAM',
      usedGPU: 'Używane GPU',
      availableGPU: 'Dostępne GPU',
      usedStorage: 'Używane miejsce',
      networkTraffic: 'Ruch sieciowy',
      cpuCores: 'rdzenie procesora',
      memoryGigabytes: 'gigabajty pamięci',
      graphicsCards: 'karty graficzne',
      storageSpace: 'miejsce na dysku'
    },
    
    // Empty states
    emptyStates: {
      noActiveContainers: 'Brak aktywnych kontenerów',
      noActiveContainersDescription: 'Utwórz nowy kontener, aby rozpocząć pracę z klastrem obliczeniowym.',
      createFirstContainer: 'Utwórz pierwszy kontener',
      noData: 'Brak danych',
      loadingData: 'Ładowanie danych...',
      errorLoadingData: 'Błąd podczas ładowania danych'
    },
    
    // Actions
    actions: {
      refresh: 'Odśwież',
      create: 'Utwórz',
      delete: 'Usuń',
      edit: 'Edytuj',
      openCodeServer: 'Otwórz Code Server',
      viewLogs: 'Zobacz logi',
      viewDetails: 'Zobacz szczegóły',
      running: 'W trakcie wykonania',
      pending: 'Oczekujące',
      waitingToStart: 'Oczekuje na uruchomienie',
      newContainer: 'Nowy kontener'
    },
    
    // Admin panel
    admin: {
      title: 'Panel administracyjny',
      userManagement: 'Zarządzanie użytkownikami',
      userManagementDescription: 'Lista wszystkich użytkowników systemu',
      users: 'Użytkownicy',
      totalUsers: 'Użytkownicy ({{count}})',
      createUser: 'Utwórz użytkownika',
      editUser: 'Edytuj użytkownika',
      deleteUser: 'Usuń użytkownika',
      userDetails: 'Szczegóły użytkownika',
      adminBadge: 'Admin',
      inactiveBadge: 'Nieaktywny',
      noEmail: 'Brak emaila',
      containers: 'Kontenery: {{current}}/{{max}}',
      gpu: 'GPU: {{current}}/{{max}}',
      lastActive: 'Ostatnia aktywność: {{date}}'
    },
    
    // Tasks/Queue
    tasks: {
      title: 'Kolejka zadań',
      active: 'Aktywne zadania',
      pending: 'Oczekujące zadania',
      completed: 'Ukończone zadania',
      failed: 'Nieudane zadania',
      noTasks: 'Brak zadań',
      createTask: 'Utwórz zadanie',
      taskDetails: 'Szczegóły zadania'
    },
    
    // Confirmations and modals
    confirmations: {
      deleteContainer: 'Usuń kontener',
      deleteContainerDescription: 'Czy na pewno chcesz usunąć kontener "{{name}}"?\n\nInformacje o kontenerze:\n• ID: {{id}}\n• Status: {{status}}\n• Szablon: {{template}}\n• CPU: {{cpu}}, RAM: {{ram}}GB, GPU: {{gpu}}\n• Utworzono: {{created}}\n\nTa operacja jest nieodwracalna.',
      confirmDelete: 'Usuń kontener',
      cancel: 'Anuluj',
      deleteUserConfirm: 'Czy na pewno chcesz usunąć tego użytkownika? Ta operacja jest nieodwracalna.',
      userDeletedSuccess: 'Użytkownik został usunięty pomyślnie',
      containerDeletedSuccess: 'Kontener został usunięty'
    },

    // Task management panel
    taskManagement: {
      title: 'Panel zarządzania zadaniami',
      autoRefresh: {
        on: 'Auto Wł',
        off: 'Auto Wył'
      },
      refreshButton: 'Odśwież',
      settings: 'Ustawienia'
    },

    // Cluster status
    clusterStatus: {
      title: 'Status połączenia z klastrem PCSS',
      checking: 'Sprawdzanie statusu klastra...',
      cannotGetStatus: 'Nie można uzyskać statusu klastra',
      noResponse: 'Brak odpowiedzi z serwera. Sprawdź połączenie sieciowe lub skontaktuj się z administratorem.',
      sshConnection: 'Połączenie SSH',
      websocketConnection: 'Połączenie WebSocket',
      websocketVerification: 'Weryfikacja WebSocket',
      active: 'Aktywne',
      inactive: 'Nieaktywne',
      containerCreationDisabled: 'Tworzenie kontenerów jest niemożliwe - klaster jest niedostępny',
      noServerResponse: 'Brak odpowiedzi od serwera przy próbie pobrania tuneli dla zadania {{jobId}}.'
    },

    // Tabs
    tabs: {
      activeTasks: 'Aktywne zadania',
      taskQueue: 'Task Queue',
      completedTasks: 'Zadania zakończone',
      adminPanel: 'Panel administracyjny'
    },

    // Task sections
    taskSections: {
      activeTasks: 'Aktywne zadania',
      activeTasksTitle: 'Zadania aktywne'
    }
  },

  // Containers
  containers: {
    title: 'Kontenery',
    create: 'Utwórz kontener',
    manage: 'Zarządzaj kontenerami',
    status: 'Status',
    actions: 'Akcje',
    start: 'Uruchom',
    stop: 'Zatrzymaj',
    restart: 'Uruchom ponownie',
    logs: 'Logi',
    terminal: 'Terminal',
    details: 'Szczegóły',
    
    // Container creation form
    create_form: {
      title: 'Utwórz nowy kontener',
      subtitle: 'Skonfiguruj i uruchom nowy kontener',
      creating_container: 'Tworzenie kontenera...',
      error_creating_container: 'Wystąpił błąd podczas tworzenia kontenera',
      error_creating_container_toast: 'Błąd podczas tworzenia kontenera',
      back_to_dashboard: 'Powrót do dashboardu',
      
      // Form sections
      basic_info: {
        title: 'Informacje podstawowe',
        container_name: 'Nazwa kontenera',
        container_name_placeholder: 'np. tensorflow_training_2024',
        container_name_description: 'Unikalna nazwa identyfikująca kontener (tylko litery, cyfry, _ i -)',
        container_name_format: 'Nazwa może zawierać tylko litery, cyfry, _ i -',
        container_name_min_error: 'Nazwa musi mieć co najmniej 3 znaki',
        container_name_max_error: 'Nazwa nie może przekraczać 100 znaków',
        container_name_regex_error: 'Nazwa może zawierać tylko litery, cyfry, _ i -'
      },
      
      template_config: {
        title: 'Konfiguracja szablonu',
        template_label: 'Szablon kontenera',
        template_placeholder_loading: 'Ładowanie szablonów...',
        template_placeholder: 'Wybierz szablon kontenera',
        template_required: 'Szablon jest wymagany',
        template_not_allowed: 'Nie masz uprawnień do tego szablonu',
        template_description: 'szablonów dostępnych dla Twojego konta',
        template_loading: 'Ładowanie dostępnych szablonów',
        template_error: 'Błąd podczas ładowania szablonów',
        template_loaded: 'Załadowano {{count}} szablonów',
        no_templates: 'Brak dostępnych szablonów',
        loading_templates: 'Ładowanie dostępnych szablonów',
        loading_templates_ellipsis: 'Ładowanie dostępnych szablonów...',
        last_used: 'Ostatnio użyty',
        never_used: 'Nigdy nie używany',
        available_templates: 'Dostępne szablony: {{templates}}',
        templates_available_for_account: '{{count}} szablonów dostępnych dla Twojego konta',
        cannot_load_templates_list: 'Nie można załadować listy dostępnych szablonów'
      },
      
      runtime_config: {
        environment_settings: 'Środowisko kontenerowe',
        select_template_to_continue: 'Wybierz szablon aby kontynuować'
      },
      
      resources: {
        title: 'Konfiguracja zasobów',
        subtitle: 'Określ wymagania sprzętowe dla kontenera',
        hardware_requirements_description: 'Określ wymagania sprzętowe dla kontenera',
        partition: 'Partycja',
        partition_placeholder: 'Wybierz partycję obliczeniową',
        partition_proxima: 'Proxima (GPU)',
        time_limit: 'Limit czasu',
        time_limit_placeholder: 'Wybierz maksymalny czas działania',
        time_limit_max_error: 'Maksymalnie {hours}h dla Twojego konta',
        hardware_resources: 'Zasoby sprzętowe',
        hardware_title: 'Zasoby sprzętowe',
        cpu_cores: 'CPU (rdzenie)',
        cpu_label: 'CPU (rdzenie)',
        cpu_placeholder: 'Wybierz CPU',
        cpu_description: '4-48 rdzeni procesora',
        memory_gb: 'RAM (GB)',
        memory_label: 'RAM (GB)',
        memory_placeholder: 'Wybierz RAM',
        memory_description: '8-512 GB pamięci RAM',
        gpu_count: 'GPU',
        gpu_label: 'GPU',
        gpu_placeholder: 'Wybierz liczbę GPU',
        gpu_description: '0-{{max}} dostępnych',
        no_gpu_available: 'Brak dostępnych GPU',
        max_label: 'max',
        gpu_max_error: 'Maksymalnie {count} GPU dla Twojego konta',
        gpu_no_available: 'Brak dostępnych GPU'
      },
      
      time_options: {
        '1_hour': '1 godzina',
        '6_hours': '6 godzin',
        '12_hours': '12 godzin',
        '24_hours': '24 godziny',
        '3_days': '3 dni',
        '7_days': '7 dni'
      },
      cpu_options: {
        '4_cores': '4 rdzenie',
        '8_cores': '8 rdzeni',
        '12_cores': '12 rdzeni',
        '16_cores': '16 rdzeni',
        '20_cores': '20 rdzeni',
        '24_cores': '24 rdzenie',
        '28_cores': '28 rdzeni',
        '32_cores': '32 rdzenie',
        '36_cores': '36 rdzeni',
        '40_cores': '40 rdzeni',
        '44_cores': '44 rdzenie',
        '48_cores': '48 rdzeni'
      },
      
      validation: {
        config_issues: 'Wykryto problemy z konfiguracją:',
        gpu_limit_exceeded: 'Przekraczasz limit GPU na kontener ({{limit}}). Żądane: {{requested}}',
        time_limit_exceeded: 'Przekraczasz limit czasu życia kontenera ({{limit}}h). Żądane: {{requested}}h',
        template_not_allowed: 'Nie masz uprawnień do używania szablonu: {{template}}',
        invalid_time_format: 'Nieprawidłowy format czasu',
        invalid_time_format_container: 'Nieprawidłowy format czasu życia kontenera',
        no_template_permission: 'Nie masz uprawnień do tego szablonu',
        max_gpus_for_account: 'Maksymalnie {{max}} GPU dla Twojego konta',
        max_time_for_account: 'Maksymalnie {{max}}h dla Twojego konta',
        no_template_permission_warning: 'Nie masz uprawnień do używania szablonu: {{template}}',
        invalid_time_format_warning: 'Nieprawidłowy format czasu życia kontenera'
      },
      
      submit: {
        create_container: 'Utwórz kontener',
        creating: 'Tworzenie kontenera...',
        fix_errors: 'Popraw błędy konfiguracji',
        fix_configuration_errors: 'Popraw błędy konfiguracji',
        complete_fields: 'Uzupełnij wymagane pola',
        complete_required_fields: 'Uzupełnij wymagane pola',
        configuration_issues_detected: 'Wykryto problemy z konfiguracją:',
        cannot_create_container: 'Nie można utworzyć kontenera',
        success: 'Kontener został utworzony pomyślnie!',
        error: 'Błąd podczas tworzenia kontenera',
        general_error: 'Wystąpił błąd podczas tworzenia kontenera'
      },
      
      // Sidebar cards
      permissions: {
        title: 'Twoje uprawnienia',
        subtitle: 'Przegląd dostępnych limitów i szablonów',
        gpu_per_container: 'GPU na kontener',
        gpu_per_container_desc: 'Maksymalna liczba',
        max_time: 'Maksymalny czas',
        max_time_desc: 'Życie kontenera',
        available_templates: 'Dostępne szablony',
        available_templates_desc: 'Dozwolone środowiska'
      },
      
      summary: {
        title: 'Podsumowanie konfiguracji',
        subtitle: 'Przegląd wybranych parametrów',
        configuration_summary: 'Podsumowanie konfiguracji',
        selected_parameters_overview: 'Przegląd wybranych parametrów',
        partition: 'Partycja',
        proxima_gpu: 'Proxima (GPU)',
        gpu_hardware_spec: 'Nvidia Tesla H100 98 GB RAM • Obliczenia GPU',
        partition_info: 'Nvidia Tesla H100 98 GB RAM • Obliczenia GPU',
        hardware_resources: 'Zasoby sprzętowe',
        hardware_title: 'Zasoby sprzętowe',
        time_label: 'Czas',
        maximum: 'maksymalny',
        core_singular: 'rdzeń',
        cores_few: 'rdzenie',
        cores_many: 'rdzeni',
        memory_unit: 'GB pamięci',
        no_gpu: 'brak GPU',
        gpu_singular: 'karta GPU',
        gpu_plural: 'karty GPU',
        container_template: 'Szablon kontenera',
        no_template_selected: 'Nie wybrano szablonu',
        not_selected: 'Nie wybrano szablonu',
        select_to_continue: 'Wybierz szablon aby kontynuować',
        container_environment: 'Środowisko kontenerowe',
        cpu_unit: 'rdzeń|rdzenie|rdzeni',
        gpu_unit: 'brak GPU|karta GPU|karty GPU',
        time_unit: 'maksymalny'
      },
      
      info: {
        title: 'Informacje',
        container_created_with_template: 'Kontener zostanie utworzony z wybranym szablonem',
        resources_reserved_by_spec: 'Zasoby będą zarezerwowane według specyfikacji',
        automatic_lifecycle_management: 'Automatyczne zarządzanie cyklem życia kontenera',
        time_limit_defines_max_runtime: 'Limit czasu określa maksymalny czas działania'
      },
      
      user_limits: {
        title: 'Twoje uprawnienia',
        description: 'Przegląd dostępnych limitów i szablonów',
        gpu_per_container: 'GPU na kontener',
        maximum_count: 'Maksymalna liczba',
        max_time: 'Maksymalny czas',
        container_lifetime: 'Życie kontenera',
        available_templates: 'Dostępne szablony',
        allowed_environments: 'Dozwolone środowiska'
      },
      
      info_card: {
        title: 'Informacje',
        info1: 'Kontener zostanie utworzony z wybranym szabalonem',
        info2: 'Zasoby będą zarezerwowane według specyfikacji',
        info3: 'Automatyczne zarządzanie cyklem życia kontenera',
        warning1: 'Limit czasu określa maksymalny czas działania'
      }
    }
  },

  // Authentication
  auth: {
    login: 'Logowanie',
    logout: 'Wyloguj',
    username: 'Nazwa użytkownika',
    password: 'Hasło',
    rememberMe: 'Zapamiętaj mnie',
    forgotPassword: 'Zapomniałeś hasła?',
    loginButton: 'Zaloguj się',
    loginError: 'Błąd logowania',
    loginSuccess: 'Zalogowano pomyślnie',
    logoutSuccess: 'Wylogowano pomyślnie'
  },

  // Errors
  errors: {
    generic: 'Wystąpił nieoczekiwany błąd',
    network: 'Błąd połączenia sieciowego',
    notFound: 'Nie znaleziono',
    unauthorized: 'Brak autoryzacji',
    forbidden: 'Dostęp zabroniony',
    serverError: 'Błąd wewnętrzny serwera',
    validation: 'Błąd walidacji danych',
    retry: 'Spróbuj ponownie',
    failedToFetchJobs: 'Nie udało się pobrać listy zadań',
    failedToFetchAdminData: 'Nie udało się pobrać danych administracyjnych',
    failedToDeleteContainer: 'Nie udało się usunąć kontenera',
    failedToDeleteUser: 'Nie udało się usunąć użytkownika',
    cannotLoadUserData: 'Nie można załadować danych użytkownika',
    cannotLoadTemplates: 'Nie można załadować szablonów kontenerów',
    cannotCreateContainer: 'Nie można utworzyć kontenera'
  },

  // Task Queue & Amumax Tasks
  tasks: {
    submit_form: {
      title: 'Nowe zadanie Amumax',
      subtitle: 'Utwórz zadanie symulacji mikromagnetycznej',
      
      basic_info: {
        title: 'Informacje podstawowe',
        task_name: 'Nazwa zadania',
        task_name_placeholder: 'np. magnetization_dynamics_2024',
        task_name_description: 'Unikalna nazwa identyfikująca zadanie (tylko litery, cyfry, _ i -)',
        description: 'Opis (opcjonalny)',
        description_placeholder: 'Dodatkowe informacje o symulacji...'
      },
      
      file_config: {
        title: 'Konfiguracja pliku',
        mx3_file_path: 'Ścieżka do pliku .mx3',
        mx3_file_path_placeholder: '/mnt/local/username/simulation.mx3',
        mx3_file_path_description: 'Pełna ścieżka do pliku skryptu Amumax (.mx3). Walidacja uruchomi się po zakończeniu pisania lub kliknięciu poza pole.'
      },
      
      resources: {
        title: 'Konfiguracja zasobów',
        partition: 'Partycja',
        partition_placeholder: 'Wybierz partycję',
        time_limit: 'Limit czasu',
        time_limit_placeholder: 'Wybierz limit czasu',
        cpu_cores: 'CPU (rdzenie)',
        cpu_description: '1-32 rdzenie CPU',
        memory_gb: 'RAM (GB)',
        memory_description: '1-128 GB RAM',
        gpu: 'GPU',
        gpu_description: '0-4 GPU',
        priority: 'Priorytet zadania',
        priority_description: '1-10, wyższy priorytet = wcześniejsze wykonanie w kolejce'
      },
      
      validation: {
        name_min: 'Nazwa musi mieć co najmniej 3 znaki',
        name_max: 'Nazwa nie może przekraczać 100 znaków',
        name_format: 'Nazwa może zawierać tylko litery, cyfry, _ i -',
        file_path_required: 'Ścieżka do pliku .mx3 jest wymagana',
        file_extension: 'Plik musi mieć rozszerzenie .mx3',
        description_max: 'Opis nie może przekraczać 500 znaków'
      },
      
      validation_steps: {
        checking_file_exists: 'Sprawdzanie istnienia pliku',
        checking_permissions: 'Sprawdzanie uprawnień',
        validating_content: 'Walidacja zawartości .mx3',
        generating_preview: 'Generowanie podglądu'
      }
    }
  },

  // Time and dates
  time: {
    now: 'teraz',
    today: 'dzisiaj',
    yesterday: 'wczoraj',
    tomorrow: 'jutro',
    thisWeek: 'w tym tygodniu',
    lastWeek: 'w zeszłym tygodniu',
    thisMonth: 'w tym miesiącu',
    lastMonth: 'w zeszłym miesiącu',
    daysAgo: '{{count}} dni temu',
    hoursAgo: '{{count}} godzin temu',
    minutesAgo: '{{count}} minut temu'
  }
};
