import type { CoachClient } from '../types';
import { todayKey } from '../services/api';

export function clientName(client: CoachClient) {
  return `${client.firstName} ${client.lastName}`;
}

export function clientInitials(client: CoachClient) {
  return `${client.firstName.charAt(0)}${client.lastName.charAt(0)}`.toUpperCase();
}

export function formatNextSession(iso: string | null | undefined) {
  if (!iso) return 'No session scheduled';
  const dateKey = iso.slice(0, 10);
  const time = new Date(iso).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });
  if (dateKey === todayKey()) return `Today ${time}`;
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}
