const STORAGE_KEY = 'metabolic:pendingCoachInvite';

export type PendingCoachInvite = {
  coachCode: string;
  timestamp: number;
};

export function setPendingCoachInvite(coachCode: string): void {
  try {
    const data: PendingCoachInvite = {
      coachCode,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable or full
  }
}

export function getPendingCoachInvite(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingCoachInvite;
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - data.timestamp > oneHour) {
      clearPendingCoachInvite();
      return null;
    }
    return data.coachCode || null;
  } catch {
    return null;
  }
}

export function clearPendingCoachInvite(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}
