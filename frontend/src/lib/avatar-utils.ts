/**
 * Avatar utility functions for generating consistent, colorful text avatars
 */

import { clsx } from "clsx";

// Predefined color palette for avatars (following Tailwind design principles)
const AVATAR_COLORS = [
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-amber-500', text: 'text-white' },
  { bg: 'bg-yellow-500', text: 'text-black' },
  { bg: 'bg-lime-500', text: 'text-black' },
  { bg: 'bg-green-500', text: 'text-white' },
  { bg: 'bg-emerald-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-black' },
  { bg: 'bg-sky-500', text: 'text-white' },
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-violet-500', text: 'text-white' },
  { bg: 'bg-purple-500', text: 'text-white' },
  { bg: 'bg-fuchsia-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-rose-500', text: 'text-white' },
  { bg: 'bg-slate-600', text: 'text-white' },
  { bg: 'bg-gray-600', text: 'text-white' },
  { bg: 'bg-zinc-600', text: 'text-white' }
];

/**
 * Simple hash function to generate consistent colors for users
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate initials from user's name or username
 */
export function generateInitials(
  firstName?: string | null, 
  lastName?: string | null, 
  username?: string
): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  
  if (firstName) {
    return firstName.slice(0, 2).toUpperCase();
  }
  
  if (lastName) {
    return lastName.slice(0, 2).toUpperCase();
  }
  
  if (username) {
    // For usernames, try to get meaningful initials
    if (username.includes('.') || username.includes('_') || username.includes('-')) {
      const parts = username.split(/[._-]/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
    }
    return username.slice(0, 2).toUpperCase();
  }
  
  return '??';
}

/**
 * Get consistent color scheme for a user based on their ID or username
 */
export function getUserAvatarColor(userId: number | string): { bg: string; text: string } {
  const hash = hashString(userId.toString());
  const colorIndex = hash % AVATAR_COLORS.length;
  return AVATAR_COLORS[colorIndex];
}

/**
 * Get avatar classes for a user (for use with AvatarFallback)
 */
export function getAvatarClasses(
  userId: number | string,
  size: 'sm' | 'md' | 'lg' | 'xl' = 'md'
): string {
  const colors = getUserAvatarColor(userId);
  
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg'
  };
  
  return clsx(
    colors.bg,
    colors.text,
    sizeClasses[size],
    'font-medium',
    'flex items-center justify-center',
    'rounded-full',
    'shadow-sm'
  );
}

/**
 * Generate avatar URL for a user (if they have one uploaded)
 */
export function getAvatarUrl(avatarUrl?: string | null, bustCache = false): string | undefined {
  if (!avatarUrl) return undefined;
  
  // If it's already a full URL, return as-is
  if (avatarUrl.startsWith('http')) {
    return bustCache ? `${avatarUrl}?t=${Date.now()}` : avatarUrl;
  }
  
  // If it's a relative path, prepend API base URL
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const fullUrl = `${API_URL}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`;
  
  return bustCache ? `${fullUrl}?t=${Date.now()}` : fullUrl;
}

export interface UserAvatarProps {
  id: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTooltip?: boolean;
  className?: string;
}
