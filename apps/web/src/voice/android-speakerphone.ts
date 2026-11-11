/**
 * Chromium on Android exposes paired communication devices as audio inputs.
 * Its explicit "Speakerphone" input selects the phone microphone and loudspeaker
 * together. Keep the system route when an external device is available.
 */
export async function openAndroidSpeakerphone(
  devices: MediaDevices,
  userAgent: string,
  current: MediaStream,
  constraints: MediaTrackConstraints,
  isCurrentSession: () => boolean,
): Promise<MediaStream | null> {
  if (!/\bAndroid\b/i.test(userAgent) || !/\bChrome\//i.test(userAgent)) return null;
  if (typeof devices.enumerateDevices !== 'function') return null;
  try {
    const inputs = (await devices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
    if (!isCurrentSession()) return null;
    if (inputs.some(({ label }) => /\b(?:headset|headphones|bluetooth|usb audio)\b/i.test(label)
      && !/\bearpiece\b/i.test(label))) return null;

    const speaker = inputs.find(({ deviceId, label }) =>
      Boolean(deviceId) && deviceId !== 'default' && /^speakerphone$/i.test(label.trim()),
    );
    if (!speaker || current.getAudioTracks()[0]?.getSettings().deviceId === speaker.deviceId) return null;

    return await devices.getUserMedia({ audio: { ...constraints, deviceId: { exact: speaker.deviceId } } });
  } catch {
    return null;
  }
}
