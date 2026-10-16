export const PERMISSIONS = Object.freeze({
  PQRS_READ: 'pqrs:read',
  PQRS_UPDATE: 'pqrs:update',
  STAFF_MANAGE: 'staff:manage',
});

const ROLE_PERMISSIONS = Object.freeze({
  administrator: new Set(Object.values(PERMISSIONS)),
  staff: new Set([PERMISSIONS.PQRS_READ, PERMISSIONS.PQRS_UPDATE]),
});

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
