import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { tokenFrom } from './core';

export async function initNfc() {
  if (!(await NfcManager.isSupported())) return false;
  await NfcManager.start();
  return true;
}

// Reads one tag and returns the member token (or null). Works on iOS and Android.
export async function readOnce() {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold the ID card near the top of your phone' });
    const tag = await NfcManager.getTag();
    for (const r of (tag && tag.ndefMessage) || []) {
      const bytes = new Uint8Array(r.payload);
      let text = '';
      try { text = Ndef.uri.decodePayload(bytes); } catch (e) {}
      if (!text) { try { text = Ndef.text.decodePayload(bytes); } catch (e) {} }
      const t = tokenFrom(text);
      if (t) return t;
    }
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}
