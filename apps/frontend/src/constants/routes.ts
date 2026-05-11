export const ROUTES = {
  AUTH: {
    LOGIN: '/login',
    COMPLETE_PROFILE: '/complete-profile',
  },
  APP: {
    DASHBOARD: '/dashboard',
    MODULES: '/modules',
    MODULE_DETAIL: (id: string) => `/modules/${id}`,
    USERS: '/users',
    USER_PROFILE: (id: string) => `/users/${id}/profile`,
    ROLES: '/roles',
    TRASH: '/trash',
    PROFILE: '/profile',
    REQUESTS: '/requests',
  },
} as const;
