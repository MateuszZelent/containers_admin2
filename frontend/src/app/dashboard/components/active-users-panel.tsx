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
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const response = await userApi.getActiveUsers();
      const newUsers = response.data;
      
      // Only update state if users actually changed
      setUsers(prevUsers => {
        const hasChanged = JSON.stringify(prevUsers) !== JSON.stringify(newUsers);
        return hasChanged ? newUsers : prevUsers;
      });
      
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to fetch active users", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // Increase interval to 60 seconds to reduce server load and flickering
    const interval = setInterval(fetchUsers, 60000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  if (isLoading || !users.length) {
    return (
      <div className="flex items-center gap-1">
        <div className="h-6 w-6 rounded-full bg-slate-200/60 dark:bg-slate-700/60 animate-pulse" />
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {isLoading ? "..." : "0"}
        </span>
      </div>
    );
  }

  const displayed = users.slice(0, 5); // Show max 5 avatars
  const extra = users.length - displayed.length;

  return (
    <div className="flex items-center gap-1.5">
      {/* Avatar stack */}
      <div className="flex -space-x-1.5">
        {displayed.map((user, index) => (
          <div 
            key={user.id}
            className="relative ring-2 ring-white/80 dark:ring-slate-800/80 rounded-full hover:z-10 transition-transform hover:scale-110"
            style={{
              zIndex: displayed.length - index
            }}
          >
            <UserAvatar
              id={user.id}
              username={user.username}
              firstName={user.first_name}
              lastName={user.last_name}
              avatarUrl={user.avatar_url}
              size="sm"
              showTooltip={true}
              className="transition-all duration-200"
            />
          </div>
        ))}
      </div>
      
      {/* Counter */}
      <div className="flex items-center gap-1 ml-1">
        {extra > 0 && (
          <div className="h-6 w-6 rounded-full bg-slate-200/80 dark:bg-slate-700/80 flex items-center justify-center ring-2 ring-white/80 dark:ring-slate-800/80">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              +{extra}
            </span>
          </div>
        )}
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
          {users.length}
        </span>
      </div>
    </div>
  );
}
