"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
} from "@tabler/icons-react"

import { UserAvatar } from "@/components/ui/user-avatar"
import { useAuth } from "@/contexts/AuthContext"
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
  const { logout } = useAuth()
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

  const handleLogout = async () => {
    console.log('[NavUser] Logout initiated');
    try {
      // Use AuthContext logout function which handles all cleanup
      logout();
      
      // Navigate to login page
      router.push('/login');
    } catch (error) {
      console.error('[NavUser] Logout error:', error);
      // Fallback - force navigation even if logout fails
      window.location.href = '/login';
    }
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
              className="data-[state=open]:bg-slate-100/50 dark:data-[state=open]:bg-slate-800/50 hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-all duration-300 backdrop-blur-sm rounded-xl group"
            >
              <div className="group-hover:scale-105 transition-transform duration-300">
                <UserAvatar
                  id={userState.id || 0}
                  username={userState.username || ''}
                  firstName={userState.first_name}
                  lastName={userState.last_name}
                  avatarUrl={userState.avatar_url || userState.avatar}
                  size="md"
                  showTooltip={false}
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-slate-900 dark:text-slate-100">{displayName}</span>
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">{userState.email}</span>
              </div>
              {!isMobile && (
                <div className="opacity-60 group-hover:opacity-100 transition-opacity duration-300">
                  <IconDotsVertical size={16} className="text-slate-400 dark:text-slate-500" />
                </div>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 rounded-xl p-2 backdrop-blur-md bg-white/95 dark:bg-slate-900/95 border border-slate-200/50 dark:border-slate-700/50 shadow-xl">
            <DropdownMenuLabel className="p-0">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50/50 dark:bg-slate-800/50">
                <UserAvatar
                  id={userState.id || 0}
                  username={userState.username || ''}
                  firstName={userState.first_name}
                  lastName={userState.last_name}
                  avatarUrl={userState.avatar_url || userState.avatar}
                  size="lg"
                  showTooltip={false}
                  className="rounded-xl shadow-md"
                />
                <div className="grid flex-1 gap-1">
                  <span className="truncate font-medium text-slate-900 dark:text-slate-100">{displayName}</span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{userState.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-200/50 dark:bg-slate-700/50" />
            <DropdownMenuGroup>
              <DropdownMenuItem 
                onClick={handleGoToSettings}
                className="rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors duration-200"
              >
                <IconCreditCard className="mr-3 h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span className="text-slate-700 dark:text-slate-300">Ustawienia</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-slate-200/50 dark:bg-slate-700/50" />
            <DropdownMenuItem 
              onClick={handleLogout}
              className="rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors duration-200"
            >
              <IconLogout className="mr-3 h-4 w-4 text-red-500 dark:text-red-400" />
              <span className="text-red-600 dark:text-red-400">Wyloguj</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}