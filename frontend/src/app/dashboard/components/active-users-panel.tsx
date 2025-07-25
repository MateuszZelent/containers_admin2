"use client"

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/registry/new-york-v4/ui/avatar";
import { userApi } from "@/lib/api-client";

interface ActiveUser {
  id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export function ActiveUsersPanel() {
  const [users, setUsers] = useState<ActiveUser[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await userApi.getActiveUsers();
        setUsers(response.data);
      } catch (err) {
        console.error("Failed to fetch active users", err);
      }
    };

    fetchUsers();
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!users.length) return null;

  const displayed = users.slice(0, 6);
  const extra = users.length - displayed.length;

  const renderAvatar = (user: ActiveUser) => {
    const initials = (user.first_name || user.last_name)
      ? `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase()
      : user.username.slice(0, 2).toUpperCase();

    return (
      <Avatar className="h-7 w-7">
        <AvatarImage src={`/avatars/${user.username}.png`} />
        <AvatarFallback className="bg-primary text-primary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
    );
  };

  return (
    <div className="flex items-center space-x-1">
      {displayed.map((u) => (
        <div key={u.id}>{renderAvatar(u)}</div>
      ))}
      {extra > 0 && (
        <div className="text-xs text-muted-foreground">+{extra}</div>
      )}
    </div>
  );
}
