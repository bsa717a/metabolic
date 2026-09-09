import { Capacitor } from '@capacitor/core';

export function isNativeAuthPlatform() {
  return Capacitor.isNativePlatform();
}
