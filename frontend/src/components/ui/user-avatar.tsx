import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/registry/new-york-v4/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/registry/new-york-v4/ui/tooltip";
import { 
  generateInitials, 
  getAvatarUrl, 
  getUserAvatarColor,
  type UserAvatarProps 
} from "@/lib/avatar-utils";
import { cn } from "@/lib/utils";

export function UserAvatar({
  id,
  username,
  firstName,
  lastName,
  avatarUrl,
  size = 'md',
  showTooltip = true,
  className
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageKey, setImageKey] = useState(0); // Force re-render of image
  
  const initials = generateInitials(firstName, lastName, username);
  const colors = getUserAvatarColor(id);
  
  // Use cache busting for uploaded images
  const imageUrl = avatarUrl ? getAvatarUrl(avatarUrl, true) : undefined;
  
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm', 
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg'
  };

  const displayName = firstName && lastName 
    ? `${firstName} ${lastName}` 
    : firstName || lastName || username;

  // Listen for user data updates to refresh avatar
  useEffect(() => {
    const handleUserDataUpdate = () => {
      setImageError(false);
      setImageKey(prev => prev + 1); // Force image reload
    };

    window.addEventListener('user-data-updated', handleUserDataUpdate);
    return () => {
      window.removeEventListener('user-data-updated', handleUserDataUpdate);
    };
  }, []);

  // Reset error state when avatarUrl changes
  useEffect(() => {
    setImageError(false);
    setImageKey(prev => prev + 1);
  }, [avatarUrl]);

  const avatarElement = (
    <Avatar className={cn(sizeClasses[size], 'shadow-sm', className)}>
      {imageUrl && !imageError ? (
        <AvatarImage 
          key={imageKey} // Force re-render when key changes
          src={imageUrl} 
          alt={`${displayName}'s avatar`}
          className="object-cover"
          onError={() => setImageError(true)}
        />
      ) : null}
      <AvatarFallback 
        className={cn(
          colors.bg,
          colors.text,
          'font-medium border-0'
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {avatarElement}
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <p className="font-medium">{displayName}</p>
              {username !== displayName && (
                <p className="text-xs text-muted-foreground">@{username}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return avatarElement;
}
