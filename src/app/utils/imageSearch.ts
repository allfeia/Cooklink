/**
 * Utility for searching dish images using Unsplash API
 * This module provides helper functions for finding high-quality food images
 */

/**
 * Search for a dish image based on dish name
 * @param dishName - The name of the dish to search for
 * @returns URL of the dish image
 */
export async function searchDishImage(dishName: string): Promise<string> {
  try {
    // Clean the dish name for better search results
    const cleanName = dishName
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();

    // Use Unsplash Source API for quick image loading
    // In production, this should use the full Unsplash API or MCP plugin
    const searchQuery = encodeURIComponent(`${cleanName} food`);
    return `https://source.unsplash.com/800x600/?${searchQuery}`;
  } catch (error) {
    console.error("Error fetching dish image:", error);
    // Return a fallback image
    return "https://source.unsplash.com/800x600/?food,dish";
  }
}
