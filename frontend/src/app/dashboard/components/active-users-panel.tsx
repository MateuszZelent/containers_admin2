import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { userApi } from "@/lib/api-client";

interface ActiveUser {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export function ActiveUsersPanel() {
  const [users, setUsers] = useState<ActiveUser[]>([]);

  const fetchUsers = async () => {
    try {
      const response = await userApi.getActiveUsers();
      setUsers(response.data);
    } catch (err) {
      console.error("Failed to fetch active users", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 30000);
    
    // Listen for user data updates to refresh active users
    const handleUserDataUpdate = () => {
      fetchUsers();
    };
    
    window.addEventListener('user-data-updated', handleUserDataUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('user-data-updated', handleUserDataUpdate);
    };
  }, []);

  if (!users.length) return null;

  const displayed = users.slice(0, 6);
  const extra = users.length - displayed.length;

  return (
    <div className="flex items-center space-x-1">
      {displayed.map((user) => (
        <UserAvatar
          key={user.id}
          id={user.id}
          username={user.username}
          firstName={user.first_name}
          lastName={user.last_name}
          avatarUrl={user.avatar_url}
          size="sm"
          showTooltip={true}
        />
      ))}
      {extra > 0 && (
        <div className="text-xs text-muted-foreground font-medium ml-1">
          +{extra}
        </div>
      )}
    </div>
  );
}
