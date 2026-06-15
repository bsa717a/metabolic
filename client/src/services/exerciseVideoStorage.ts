import { getIdToken } from './auth';
import type { AdminExercise } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'];

export function validateExerciseVideoFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const hasVideoMime = file.type.startsWith('video/');
  const hasAllowedExt = ext != null && ALLOWED_EXTENSIONS.includes(ext);
  if (!hasVideoMime && !hasAllowedExt) {
    throw new Error('Please choose a video file.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Each video must be 100 MB or smaller.');
  }
}

export async function uploadExerciseHowToVideo(exerciseId: string, file: File) {
  validateExerciseVideoFile(file);

  const token = await getIdToken();
  if (!token) {
    throw new Error('Sign in again to upload videos.');
  }

  const formData = new FormData();
  formData.append('video', file, file.name);

  const response = await fetch(`${API_URL}/api/admin/exercises/${exerciseId}/how-to-video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? payload?.message ?? response.statusText);
  }

  return (await response.json()) as AdminExercise;
}
