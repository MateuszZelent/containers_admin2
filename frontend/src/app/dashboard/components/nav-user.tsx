"use client"

import { useRouter } from "next/navigation"
import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/registry/new-york-v4/ui/avatar"
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

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  const handleLogout = () => {
    // Debuguj - sprawdź co dokładnie jest w localStorage przed usunięciem
    console.log('Local Storage before logout:', { ...localStorage });
    
    // Użyj bezpośredniego dostępu do localStorage przez window
    window.localStorage.removeItem('auth_token');
    
    // Sprawdź inne możliwe nazwy tokenu używane w aplikacji
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('jwt');
    window.localStorage.removeItem('accessToken');
    
    // Debuguj - sprawdź po usunięciu
    console.log('Local Storage after removing tokens:', { ...localStorage });
    
    // Wymuś pełne przeładowanie strony, aby odświeżyć stan aplikacji
    window.location.href = '/login';
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              {!isMobile && <IconDotsVertical size={16} />}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 rounded-lg p-1.5">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 gap-0.5">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconUserCircle className="mr-2 h-4 w-4" />
                Konto
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconCreditCard className="mr-2 h-4 w-4" />
                Ustawienia
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification className="mr-2 h-4 w-4" />
                Powiadomienia
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
