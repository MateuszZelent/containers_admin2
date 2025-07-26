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
  const [lastAvatarUrl, setLastAvatarUrl] = useState(avatarUrl);
  
  const initials = generateInitials(firstName, lastName, username);
  const colors = getUserAvatarColor(id);
  
  // Use cache busting only for uploaded images and only when avatarUrl changes
  const imageUrl = avatarUrl ? getAvatarUrl(avatarUrl, false) : undefined;
  
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm', 
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg'
  };

  const displayName = firstName && lastName 
    ? `${firstName} ${lastName}` 
    : firstName || lastName || username;

  // Only reset error state when avatarUrl actually changes
  useEffect(() => {
    if (avatarUrl !== lastAvatarUrl) {
      setImageError(false);
      setLastAvatarUrl(avatarUrl);
    }
  }, [avatarUrl, lastAvatarUrl]);

  const avatarElement = (
    <Avatar className={cn(sizeClasses[size], 'shadow-sm', className)}>
      {imageUrl && !imageError ? (
        <AvatarImage 
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
