/**
 * Navigation Configuration
 *
 * Defines which pages appear in the site navigation and their display order.
 * Astro handles routing via the filesystem — this only controls nav menus.
 */

export interface NavItem {
  label: string;
  href: string;
  order: number;
}

export const navItems: NavItem[] = [
  { label: 'Components', href: '/components', order: 1 },
  { label: 'Blog', href: '/blog', order: 2 },
  { label: 'Docs', href: '/docs/', order: 4 },
  { label: 'Contact', href: '/contact', order: 5 },
];

/**
 * Get navigation items sorted by order
 */
export function getNavItems(): NavItem[] {
  return [...navItems].sort((a, b) => a.order - b.order);
}
