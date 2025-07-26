"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
} from "@tabler/icons-react"

import { UserAvatar } from "@/components/ui/user-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/registry/new-york-v4/ui/sidebar"

// Bardziej elastyczny interfejs dla danych użytkownika
interface UserData {
  username?: string
  email: string
  first_name?: string
  last_name?: string
  id?: number
  name?: string
  full_name?: string
  avatar?: string
  avatar_url?: string
  // ...pozostałe pola
}

export function NavUser({ user }: { user: UserData }) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [userState, setUserState] = useState(user)

  // Listen for user data updates
  useEffect(() => {
    const handleUserDataUpdate = () => {
      // Refresh user data from localStorage or state management
      try {
        const userData = localStorage.getItem('user_data');
        if (userData) {
          const parsedData = JSON.parse(userData);
          setUserState(prev => ({ ...prev, ...parsedData }));
        }
      } catch (error) {
        console.error('Error updating user data:', error);
      }
    };

    window.addEventListener('user-data-updated', handleUserDataUpdate);
    return () => {
      window.removeEventListener('user-data-updated', handleUserDataUpdate);
    };
  }, []);

  const handleLogout = () => {
    // Usuwamy wszystkie dane użytkownika
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('user_data_timestamp');
    
    window.location.href = '/login';
  }

  // Ustalamy nazwę do wyświetlenia
  const displayName = userState.full_name || userState.name || 
    (userState.first_name && userState.last_name ? `${userState.first_name} ${userState.last_name}` : 
     userState.first_name || userState.last_name || userState.username || "Użytkownik");

  const handleGoToSettings = () => {
    router.push("/dashboard/settings");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]: data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="grayscale">
                <UserAvatar
                  id={userState.id || 0}
                  username={userState.username || ''}
                  firstName={userState.first_name}
                  lastName={userState.last_name}
                  avatarUrl={userState.avatar_url || userState.avatar}
                  size="md"
                  showTooltip={false}
                  className="rounded-lg"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs">{userState.email}</span>
              </div>
              {!isMobile && <IconDotsVertical size={16} />}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 rounded-lg p-1.5">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3">
                <UserAvatar
                  id={userState.id || 0}
                  username={userState.username || ''}
                  firstName={userState.first_name}
                  lastName={userState.last_name}
                  avatarUrl={userState.avatar_url || userState.avatar}
                  size="lg"
                  showTooltip={false}
                  className="rounded-lg"
                />
                <div className="grid flex-1 gap-0.5">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs">{userState.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handleGoToSettings}> {/* Dodano onClick */}
                <IconCreditCard className="mr-2 h-4 w-4" />
                Ustawienia
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <IconLogout className="mr-2 h-4 w-4" />
              Wyloguj
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}