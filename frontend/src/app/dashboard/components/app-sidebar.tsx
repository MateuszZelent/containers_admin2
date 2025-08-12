"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import {
  IconCamera,
  IconDashboard,
  IconFileAi,
  IconFileDescription,
  IconInnerShadowTop,
  IconListCheck,
  IconShield,
} from "@tabler/icons-react"
import { Cog, Zap, Plus } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/registry/new-york-v4/ui/sidebar"
import { NavMain } from "@/app//dashboard/components/nav-main"
import { NavAdmin } from "@/app//dashboard/components/nav-admin"
import { NavUser } from "@/app/dashboard/components/nav-user"
import { userApi } from "@/lib/api-client"
import { APP_VERSION, APP_VERSION_DATE } from "@/version"

// Default data with navigation items
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Kolejka zadań",
      url: "/dashboard/task_queue",
      icon: IconListCheck,
      items: [
        {
          title: "Przegląd zadań",
          url: "/dashboard/task_queue",
        },
        {
          title: "Złóż zadanie Amumax",
          url: "/dashboard/task_queue/submit",
          icon: Zap,
        },
      ],
    },
    {
      title: "Ustawienia",
      url: "/dashboard/settings",
      icon: Cog,
    },
  ],
  adminNavigation: [
    {
      title: "Panel Administracyjny",
      url: "/dashboard/admin",
      icon: IconShield,
      items: [
        {
          title: "Przegląd",
          url: "/dashboard/admin",
        },
        {
          title: "Zarządzanie zadaniami",
          url: "/dashboard/admin/jobs",
        },
        {
          title: "Zarządzanie użytkownikami",  
          url: "/dashboard/admin/users",
        },
        {
          title: "Ustawienia główne",
          url: "/dashboard/admin/settings",
        },
      ],
    },
    {
      title: "AMUflow",
      url: "/dashboard/admin/amuflow",
      icon: IconInnerShadowTop,
      items: [
        {
          title: "Flow Designer",
          url: "/dashboard/admin/amuflow/flow",
        },
      ],
    },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: IconCamera,
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: IconFileDescription,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: IconFileAi,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
}

// Define interface for user data
interface UserData {
  email: string;
  name: string;
  avatar: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  avatar_url?: string;
  id?: number;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Stan dla danych użytkownika
  const [userData, setUserData] = useState<UserData>({
    email: "",
    name: "",
    avatar: "", // Będzie ustawiony dynamicznie
  });
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Pobierz dane użytkownika gdy komponent jest montowany
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      
      // Najpierw sprawdź czy dane są w localStorage
      try {
        const storedUserData = localStorage.getItem('user_data');
        if (storedUserData) {
          const parsedUserData = JSON.parse(storedUserData);
          // Sprawdź czy dane nie są przestarzałe (np. starsze niż 1 dzień)
          const storedTime = localStorage.getItem('user_data_timestamp');
          const isDataFresh = storedTime && (Date.now() - parseInt(storedTime)) < 86400000; // 24h
          
          if (isDataFresh) {
            // Używaj danych z localStorage jeśli są świeże (mniej niż 5 minut)
            
            // Upewnij się, że mamy prawidłowe pełne imię i nazwisko
            const userData = ensureFullName(parsedUserData);
            setUserData(userData);
            setCurrentUser(parsedUserData);
            setIsLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error("Error reading user data from localStorage:", error);
        // Kontynuuj z pobraniem danych z API w przypadku błędu
      }
      
      // Pobierz dane z API jeśli nie ma w localStorage lub są przestarzałe
      try {
        const response = await userApi.getCurrentUser();
        
        if (response && response.data) {
          // Zapewnij poprawne formatowanie przed zapisaniem danych
          const userDataFromApi = ensureFullName(response.data);
          
          // Zapisz w state
          setUserData(userDataFromApi);
          setCurrentUser(response.data);
          setCurrentUser(response.data);
          
          // Zapisz w localStorage do ponownego użycia
          localStorage.setItem('user_data', JSON.stringify(response.data));
          localStorage.setItem('user_data_timestamp', Date.now().toString());
          // Dane zostały pomyślnie pobrane z API
        }
      } catch (error) {
        console.error("Error fetching user data from API:", error);
        // Próba użycia przestarzałych danych z localStorage w przypadku błędu API
        const storedUserData = localStorage.getItem('user_data');
        if (storedUserData) {
          const parsedUserData = JSON.parse(storedUserData);
          const userData = ensureFullName(parsedUserData);
          
          setUserData(userData);
          // Użyj starszych danych z localStorage w przypadku błędu API
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Nowa funkcja pomocnicza do zapewnienia, że dane zawierają pole full_name
  const ensureFullName = (userData: Record<string, unknown>): UserData => {
    // Create proper UserData object with type safety
    const firstName = String(userData.first_name || '');
    const lastName = String(userData.last_name || '');
    const fullName = userData.full_name ? String(userData.full_name) : `${firstName} ${lastName}`.trim();
    
    // Generate proper avatar URL
    let avatarUrl = '';
    if (userData.avatar_url) {
      avatarUrl = String(userData.avatar_url);
    } else if (userData.avatar) {
      avatarUrl = String(userData.avatar);
    } else if (userData.username) {
      // Generate avatar URL based on username
      const username = String(userData.username);
      avatarUrl = `/static/avatars/${username}.jpg`;
    }
    
    return {
      id: userData.id ? Number(userData.id) : 0,
      email: String(userData.email || ''),
      name: fullName || String(userData.username || 'User'),
      avatar: avatarUrl,
      avatar_url: avatarUrl,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      username: String(userData.username || '')
    };
  };

  // Dodanie nasłuchiwania na zmiany w localStorage
  useEffect(() => {
    // Funkcja do odświeżania danych z localStorage
    const handleStorageChange = () => {
      const storedUserData = localStorage.getItem('user_data');
      if (storedUserData) {
        try {
          const parsedUserData = JSON.parse(storedUserData);
          const userData = ensureFullName(parsedUserData);
          setUserData(userData);
          setCurrentUser(parsedUserData);
        } catch (error) {
          console.error("Error parsing user data from localStorage:", error);
        }
      }
    };

    // Dodaj nasłuchiwanie na zdarzenie storage
    window.addEventListener('storage', handleStorageChange);
    
    // Dodatkowo możemy nasłuchiwać na własne zdarzenie dla aktualizacji w tym samym oknie
    window.addEventListener('user-data-updated', handleStorageChange);

    // Usunięcie nasłuchiwania przy odmontowaniu
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('user-data-updated', handleStorageChange);
    };
  }, []);

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-slate-200/20 dark:border-slate-800/20" {...props}>
      <SidebarHeader className="backdrop-blur-sm bg-gradient-to-b from-slate-100/10 via-white/5 to-transparent dark:from-slate-800/10 dark:via-slate-900/5 dark:to-transparent border-b border-slate-200/10 dark:border-slate-800/10">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-3 hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-all duration-300 backdrop-blur-sm rounded-xl group"
            >
              <a href="#" className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/80 to-purple-600/80 shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                  <IconInnerShadowTop className="!size-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-semibold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                    AMUcontainers
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    v{APP_VERSION} ({APP_VERSION_DATE})
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="bg-gradient-to-b from-transparent via-slate-50/5 to-transparent dark:via-slate-900/5">
        <NavMain items={data.navMain} />
        {currentUser?.is_superuser && (
          <NavAdmin items={data.adminNavigation} />
        )}
      </SidebarContent>
      <SidebarFooter className="backdrop-blur-sm bg-gradient-to-t from-slate-100/10 via-white/5 to-transparent dark:from-slate-800/10 dark:via-slate-900/5 dark:to-transparent border-t border-slate-200/10 dark:border-slate-800/10">
        {!isLoading && <NavUser user={userData} />}
      </SidebarFooter>
    </Sidebar>
  )
}
