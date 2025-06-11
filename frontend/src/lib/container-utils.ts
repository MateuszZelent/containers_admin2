/**
 * Utility functions for container name formatting
 */

/**
 * Formats container name for display by:
 * - Removing "container_" prefix
 * - Replacing underscores with spaces
 * - Capitalizing first letter of each word
 * 
 * @param containerName - Raw container name from backend
 * @returns Formatted display name
 * 
 * @example
 * formatContainerName("container_admin_glowny") => "Admin glowny"
 * formatContainerName("container_mysql_database") => "Mysql database"
 * formatContainerName("container_nginx_proxy") => "Nginx proxy"
 */
export function formatContainerName(containerName: string): string {
  if (!containerName) return '';
  
  // Remove "container_" prefix
  let formatted = containerName.replace(/^container_/, '');
  
  // Replace underscores with spaces
  formatted = formatted.replace(/_/g, ' ');
  
  // Capitalize first letter of the first word only
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
  
  return formatted;
}

/**
 * Alternative version that capitalizes first letter of each word
 * 
 * @param containerName - Raw container name from backend
 * @returns Formatted display name with each word capitalized
 * 
 * @example
 * formatContainerNameTitle("container_admin_glowny") => "Admin Glowny"
 * formatContainerNameTitle("container_mysql_database") => "Mysql Database"
 */
export function formatContainerNameTitle(containerName: string): string {
  if (!containerName) return '';
  
  // Remove "container_" prefix
  let formatted = containerName.replace(/^container_/, '');
  
  // Replace underscores with spaces
  formatted = formatted.replace(/_/g, ' ');
  
  // Capitalize first letter of each word
  formatted = formatted.replace(/\b\w/g, l => l.toUpperCase());
  
  return formatted;
}

/**
 * Generates a shortened display name for containers (useful for small cards)
 * 
 * @param containerName - Raw container name from backend
 * @param maxLength - Maximum length of the result (default: 15)
 * @returns Shortened formatted name
 * 
 * @example
 * formatContainerNameShort("container_admin_glowny") => "Admin glowny"
 * formatContainerNameShort("container_very_long_database_name", 10) => "Very lo..."
 */
export function formatContainerNameShort(containerName: string, maxLength: number = 15): string {
  const formatted = formatContainerName(containerName);
  
  if (formatted.length <= maxLength) {
    return formatted;
  }
  
  return formatted.substring(0, maxLength - 3) + '...';
}

/**
 * Gets the original container name from a formatted display name
 * (reverse operation - useful for API calls)
 * 
 * @param displayName - Formatted display name
 * @returns Original container name with "container_" prefix
 * 
 * @example
 * getOriginalContainerName("Admin glowny") => "container_admin_glowny"
 */
export function getOriginalContainerName(displayName: string): string {
  if (!displayName) return '';
  
  // Convert to lowercase and replace spaces with underscores
  let original = displayName.toLowerCase().replace(/\s+/g, '_');
  
  // Add "container_" prefix
  original = `container_${original}`;
  
  return original;
}

/**
 * Test cases for container name formatting
 */
export const TEST_CASES = {
  'container_admin_glowny': 'Admin glowny',
  'container_mysql_database': 'Mysql database', 
  'container_nginx_proxy': 'Nginx proxy',
  'container_redis_cache': 'Redis cache',
  'container_python_jupyter': 'Python jupyter',
  'container_ai_model_training': 'Ai model training',
  'container_web_app_frontend': 'Web app frontend'
} as const;

/**
 * Validates that the formatting function works correctly with test cases
 */
export function validateFormatting(): boolean {
  for (const [input, expected] of Object.entries(TEST_CASES)) {
    const result = formatContainerName(input);
    if (result !== expected) {
      console.error(`Formatting failed for ${input}. Expected: ${expected}, Got: ${result}`);
      return false;
    }
  }
  return true;
}
