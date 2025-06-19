/**
 * Get the appropriate icon URL for a given icon slug
 * Handles special cases for LinkedIn and Microsoft icons that were removed from Simple Icons
 */
export const getIconUrl = (iconSlug: string): string => {
  const slug = iconSlug.toLowerCase();

  // Special handling for LinkedIn and other Microsoft-removed icons
  if (slug === "linkedin") {
    return "https://raw.githubusercontent.com/CLorant/readme-social-icons/main/small/colored/linkedin.svg";
  }

  if (["microsoft", "outlook", "teams", "onedrive", "azure"].includes(slug)) {
    return `https://techicons.dev/icons/${slug}.svg`;
  }

  // Default to Simple Icons
  return `https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/${slug}.svg`;
};
