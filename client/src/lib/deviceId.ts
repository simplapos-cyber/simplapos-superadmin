/**
 * deviceId.ts
 * Generiert eine persistente, gerätespezifische UUID die im localStorage gespeichert wird.
 * Diese ID wird beim Login mitgesendet und vom Server zur Session-Zuordnung verwendet.
 * So kann der Server erkennen ob ein anderes Gerät denselben Account nutzt.
 */

const DEVICE_ID_KEY = "simplapos_device_id";

export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY);
}
