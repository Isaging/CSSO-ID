import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { tokenFrom } from './core';

let started = false;

export async function initNfc() {
  if (started) return true;
  if (!(await NfcManager.isSupported())) return false;
  await NfcManager.start();
  started = true;
  return true;
}

// Reads one tag and returns the member token (or null). Works on iOS and Android.
export async function readOnce() {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: 'Hold the ID card near the top of your phone',
    });
    const tag = await NfcManager.getTag();
    for (const record of (tag && tag.ndefMessage) || []) {
      const bytes = new Uint8Array(record.payload);
      let text = '';
      try {
        text = Ndef.uri.decodePayload(bytes);
      } catch (e) {}
      if (!text) {
        try {
          text = Ndef.text.decodePayload(bytes);
        } catch (e) {}
      }
      const token = tokenFrom(text);
      if (token) return token;
    }
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// Writes the link to a blank sticker, reads it back to verify, then (optionally) locks it for good.
// Throws if nothing was written. Returns { locked, lockFailed }.
export async function writeSticker(url, token, lock, ownerOf) {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold the blank sticker near the top of your phone and keep it there.' });
    const tag = await NfcManager.getTag();
    for (const r of (tag && tag.ndefMessage) || []) {            // never overwrite a sticker that belongs to someone else
      let text = ''; try { text = Ndef.uri.decodePayload(new Uint8Array(r.payload)); } catch (e) {}
      const t = tokenFrom(text), who = t && t !== token ? ownerOf(t) : null;
      if (who) throw new Error('OWNED:' + who);
    }
    await NfcManager.ndefHandler.writeNdefMessage(Ndef.encodeMessage([Ndef.uriRecord(url)]));
    const back = await NfcManager.ndefHandler.getNdefMessage();
    const recs = Array.isArray(back) ? back : (back && back.ndefMessage) || [];
    const ok = recs.some(r => { try { return tokenFrom(Ndef.uri.decodePayload(new Uint8Array(r.payload))) === token; } catch (e) { return false; } });
    if (!ok) throw new Error('Verify failed');
    if (!lock) return { locked: false, lockFailed: false };
    try {
      if (typeof NfcManager.ndefHandler.makeReadOnly !== 'function') throw new Error('no lock support');
      await NfcManager.ndefHandler.makeReadOnly();                // permanent
      return { locked: true, lockFailed: false };
    } catch (e) { return { locked: false, lockFailed: true }; }
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}