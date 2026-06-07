export const ROUTES = {
  AUTH: {
    LOGIN: '/login',
    COMPLETE_PROFILE: '/complete-profile',
    CHANGE_PASSWORD:  '/change-password',
    SETUP: '/setup',
  },
  APP: {
    DASHBOARD:    '/dashboard',
    MODULES:      '/modules',
    MODULE_DETAIL: (id: string) => `/modules/${id}`,
    USERS:        '/users',
    USER_PROFILE: (id: string) => `/users/${id}/profile`,
    ROLES:        '/roles',
    TRASH:        '/trash',
    PROFILE:      '/profile',
    REQUESTS:     '/requests',
    TICKETS:      '/tickets',
    INVENTORY:    '/inventory',
    REPORTS:      '/reports',
    MY_TICKETS:   '/my-tickets',
    CALENDAR:     '/calendar',
  },
} as const;
