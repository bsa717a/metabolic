import type { Role } from '../types';

const adminRoles: Role[] = ['SUPER_ADMIN', 'ADMIN'];

export function isAdminRole(role?: Role | null) {
  return role ? adminRoles.includes(role) : false;
}

export function isSuperAdminRole(role?: Role | null) {
  return role === 'SUPER_ADMIN';
}

export function isCoachRole(role?: Role | null) {
  return role === 'COACH' || role === 'SUPER_ADMIN';
}
