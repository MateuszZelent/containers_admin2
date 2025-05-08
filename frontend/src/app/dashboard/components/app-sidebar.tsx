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
} from "@tabler/icons-react"
import { Cog } from "lucide-react"

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
import { NavUser } from "@/app/dashboard/components/nav-user"
import { userApi } from "@/lib/api-client"

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
      url: "/dashboard/jobs_queue",
      icon: IconListCheck,
    },
    {
      title: "Ustawienia",
      url: "/dashboard/settings",
      icon: Cog,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Stan dla danych użytkownika
  const [userData, setUserData] = useState({
    email: "",
    name: "",
    avatar: "/avatars/shadcn.jpg", // Domyślny awatar
  });
  const [isLoading, setIsLoading] = useState(true);

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
            console.log("Using cached user data from localStorage");
            
            // Upewnij się, że mamy prawidłowe pełne imię i nazwisko
            const userData = ensureFullName(parsedUserData);
            
            setUserData({
              name: userData.full_name || userData.username || "User",
              email: userData.email || "",
              avatar: "/avatars/shadcn.jpg",
              ...userData
            });
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
          setUserData({
            name: userDataFromApi.full_name || userDataFromApi.username || "User",
            email: userDataFromApi.email || "",
            avatar: "/avatars/shadcn.jpg", // Domyślny awatar
            ...userDataFromApi
          });
          
          // Zapisz w localStorage do ponownego użycia
          localStorage.setItem('user_data', JSON.stringify(userDataFromApi));
          localStorage.setItem('user_data_timestamp', Date.now().toString());
          console.log("User data fetched from API and cached");
        }
      } catch (error) {
        console.error("Error fetching user data from API:", error);
        // Próba użycia przestarzałych danych z localStorage w przypadku błędu API
        const storedUserData = localStorage.getItem('user_data');
        if (storedUserData) {
          const parsedUserData = JSON.parse(storedUserData);
          const userData = ensureFullName(parsedUserData);
          
          setUserData({
            name: userData.full_name || userData.username || "User",
            email: userData.email || "",
            avatar: "/avatars/shadcn.jpg",
            ...userData
          });
          console.log("Using outdated user data from localStorage due to API error");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Nowa funkcja pomocnicza do zapewnienia, że dane zawierają pole full_name
  const ensureFullName = (userData: any) => {
    // Kopiujemy dane, aby nie modyfikować oryginalnego obiektu
    const enhancedData = { ...userData };
    
    // Generuj pełne imię i nazwisko, jeśli mamy te dane, a full_name nie jest ustawione
    if (!enhancedData.full_name && (enhancedData.first_name || enhancedData.last_name)) {
      const firstName = enhancedData.first_name || '';
      const lastName = enhancedData.last_name || '';
      enhancedData.full_name = `${firstName} ${lastName}`.trim();
    }
    
    return enhancedData;
  };

  // Dodanie nasłuchiwania na zmiany w localStorage
  useEffect(() => {
    // Funkcja do odświeżania danych z localStorage
    const handleStorageChange = () => {
      const storedUserData = localStorage.getItem('user_data');
      if (storedUserData) {
        try {
          const parsedUserData = JSON.parse(storedUserData);
          setUserData({
            name: parsedUserData.full_name || 
                 (parsedUserData.first_name && parsedUserData.last_name ? 
                  `${parsedUserData.first_name} ${parsedUserData.last_name}` : 
                  parsedUserData.username || "User"),
            email: parsedUserData.email || "",
            avatar: "/avatars/shadcn.jpg",
            ...parsedUserData
          });
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
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="#">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">AMUcontainers</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        {!isLoading && <NavUser user={userData} />}
      </SidebarFooter>
    </Sidebar>
  )
}
