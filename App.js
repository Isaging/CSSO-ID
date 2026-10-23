import React, { useEffect, useReducer, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Alert, StatusBar, useColorScheme, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import * as core from './src/core';
import { initNfc, readOnce } from './src/nfc';

const LT = { bg: '#f4f6fa', card: '#fff', text: '#16202e', muted: '#5b6778', border: '#dde3ec', accent: '#1f5fd6', at: '#fff', ok: '#0f7b4a', okb: '#e0f5ea', bad: '#b3261e', badb: '#fde8e6', warn: '#8a5a00', warnb: '#fff1d6' };
const DK = { bg: '#0f141b', card: '#19212c', text: '#e8edf5', muted: '#9aa6b8', border: '#2a3441', accent: '#6b9bff', at: '#0b1220', ok: '#5fd39b', okb: '#12301f', bad: '#ff8a80', badb: '#3a1714', warn: '#f2c35b', warnb: '#36290b' };

export default function App() {
  const dark = useColorScheme() === 'dark', P = dark ? DK : LT, S = makeStyles(P);
  const [, tick] = useReducer(x => x + 1, 0);
  const [tab, setTab] = useState('office');
  const [res, setRes] = useState({ k: '', title: 'Tap Scan, then hold an ID card to the phone' });
  const [cur, setCur] = useState(null), [amt, setAmt] = useState(''), [man, setMan] = useState('');
  const [nfcOk, setNfcOk] = useState(false), [online, setOnline] = useState(true);
  const [set, setSet] = useState(core.db.settings);

  useEffect(() => {
    core.load().then(() => setSet(core.db.settings));
    const un = core.subscribe(tick);
    initNfc().then(setNfcOk).catch(() => setNfcOk(false));
    const nn = NetInfo.addEventListener(s => { const on = !!s.isConnected && s.isInternetReachable !== false; setOnline(on); if (on) core.sync(); });
    return () => { un(); nn(); };
  }, []);

  const tone = k => ({ ok: [P.okb, P.ok], bad: [P.badb, P.bad], warn: [P.warnb, P.warn] }[k] || [P.bg, P.muted]);
  const switchTab = t => { setTab(t); setCur(null); setAmt(''); if (t !== 'data') setRes({ k: '', title: t === 'office' ? 'Scan an ID to log in/out' : 'Scan an ID to start printing' }); };

  async function act(token) {
    const r = await core.tap(token, tab === 'print' ? 'print' : 'office');
    if (!r) return;
    setRes(r); setCur(r.print || null); setAmt('');
  }
  async function scan() {
    if (!nfcOk) return setRes({ k: 'bad', title: 'NFC not available', sub: 'This phone has no NFC, or NFC is turned off.' });
    try {
      const t = await readOnce();
      t ? act(t) : setRes({ k: 'bad', title: 'Unrecognized tag' });
    } catch (e) {
      if (!/cancel/i.test(String(e))) setRes({ k: 'bad', title: 'Couldn’t read the tag', sub: 'Try again.' });
    }
  }
  async function deduct() { const r = await core.deduct(cur, parseFloat(amt)); setRes(r); if (r.k === 'ok') setCur(null); }
  const say = async p => { const m = await p; if (m) Alert.alert('CSSO', m); };
  async function doImport() {
    try { const r = await core.pickAndImport(); if (r) Alert.alert('Imported', r.add + ' new, ' + r.upd + ' updated.'); }
    catch (e) { Alert.alert('Import failed', e.message || 'Could not read that file.'); }
  }
  async function exportNew() {
    try {
      const ids = await core.exportNew();
      if (!ids) return Alert.alert('CSSO', 'No new records.');
      Alert.alert('Exported', 'Mark these records as sent so they won’t appear again?', [{ text: 'Not yet' }, { text: 'Mark as sent', onPress: () => core.markSynced(ids) }]);
    } catch (e) { Alert.alert('Export failed', e.message || ''); }
  }

  const [bg, fg] = tone(res.k);
  const Btn = ({ t, onPress, ghost, off }) => (
    <TouchableOpacity disabled={off} onPress={onPress} style={[S.btn, ghost && S.ghost, off && { opacity: 0.5 }]}>
      <Text style={[S.btnT, ghost && { color: P.text }]}>{t}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={S.root}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
        <View style={S.bar}><Text style={S.mut}>{online ? 'Online' : 'Offline'}</Text><Text style={S.mut}>{core.pending()} waiting to send</Text></View>
        <View style={S.tabs}>
          {['office', 'print', 'data'].map(t => (
            <TouchableOpacity key={t} onPress={() => switchTab(t)} style={[S.tab, tab === t && S.tabOn]}>
              <Text style={[S.tabT, tab === t && { color: P.at }]}>{{ office: 'Office', print: 'Printing', data: 'Data' }[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab !== 'data' && (
          <View style={S.card}>
            <Btn t="Scan ID card" onPress={scan} />
            <View style={[S.res, { backgroundColor: bg }]}>
              <Text style={[S.big, { color: fg }]}>{res.title}</Text>
              {!!res.sub && <Text style={[S.sub, { color: fg }]}>{res.sub}</Text>}
            </View>
            {tab === 'print' && cur && (
              <View>
                <Text style={S.lab}>Print cost (₱)</Text>
                <TextInput style={S.in} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={P.muted} />
                <View style={S.row}>{[1, 2, 5, 10].map(a => <TouchableOpacity key={a} style={S.q} onPress={() => setAmt(String(a))}><Text style={{ color: P.text }}>₱{a}</Text></TouchableOpacity>)}</View>
                <Btn t="Deduct from balance" onPress={deduct} />
              </View>
            )}
            <Text style={S.lab}>No NFC? Enter a token</Text>
            <TextInput style={S.in} value={man} onChangeText={setMan} autoCapitalize="none" placeholder="member token" placeholderTextColor={P.muted} />
            <Btn ghost t="Use token" onPress={() => { const t = core.tokenFrom('?t=' + man.trim()); t ? act(t) : setRes({ k: 'bad', title: 'Invalid token' }); }} />
          </View>
        )}

        {tab === 'data' && (
          <View>
            <View style={S.card}>
              <Text style={S.h}>Member list</Text>
              <Text style={S.mut}>{Object.keys(core.db.members).length} members on this phone. CSV columns: token, student_no, full_name (optional: status, points, print_balance, valid_until).</Text>
              <Btn t="Import member CSV" onPress={doImport} />
            </View>
            <View style={S.card}>
              <Text style={S.h}>Send data</Text>
              <Text style={S.mut}>Records are saved on this phone first and sync to your Google Sheet when online. You can also export CSV for Excel.</Text>
              <Btn t="Sync now" onPress={() => say(core.sync(true))} />
              <Btn ghost t="Export new records (CSV)" onPress={exportNew} />
              <Btn ghost t="Export recent records (CSV)" onPress={() => core.exportAll()} />
              <Btn ghost t="Export members and balances (CSV)" onPress={() => core.exportMembers()} />
            </View>
            <View style={S.card}>
              <Text style={S.h}>Settings</Text>
              <Text style={S.lab}>Officer / device name</Text>
              <TextInput style={S.in} value={set.officer} onChangeText={v => setSet({ ...set, officer: v })} />
              <Text style={S.lab}>Sync URL (Google Apps Script, optional)</Text>
              <TextInput style={S.in} value={set.url} onChangeText={v => setSet({ ...set, url: v })} autoCapitalize="none" autoCorrect={false} placeholder="https://script.google.com/macros/s/.../exec" placeholderTextColor={P.muted} />
              <Text style={S.lab}>Sync key</Text>
              <TextInput style={S.in} value={set.key} onChangeText={v => setSet({ ...set, key: v })} autoCapitalize="none" autoCorrect={false} />
              <Btn ghost t="Save settings" onPress={async () => { await core.saveSettings({ officer: set.officer.trim(), url: set.url.trim(), key: set.key.trim() }); Alert.alert('CSSO', 'Saved.'); }} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = P => StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg }, pad: { padding: 12, maxWidth: 460, width: '100%', alignSelf: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, mut: { color: P.muted, fontSize: 13, marginVertical: 4 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: { flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, alignItems: 'center' },
  tabOn: { backgroundColor: P.accent, borderColor: P.accent }, tabT: { color: P.text, fontWeight: '600' },
  card: { backgroundColor: P.card, borderColor: P.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  btn: { backgroundColor: P.accent, borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 10 },
  ghost: { backgroundColor: P.bg, borderWidth: 1, borderColor: P.border }, btnT: { color: P.at, fontWeight: '700', fontSize: 15 },
  res: { padding: 20, borderRadius: 12, marginTop: 12, alignItems: 'center' }, big: { fontSize: 20, fontWeight: '700', textAlign: 'center' }, sub: { marginTop: 6, fontSize: 14, textAlign: 'center' },
  lab: { color: P.muted, fontSize: 13, marginTop: 12, marginBottom: 4 }, h: { color: P.text, fontSize: 16, fontWeight: '700' },
  in: { borderWidth: 1, borderColor: P.border, borderRadius: 10, padding: 11, fontSize: 16, color: P.text, backgroundColor: P.bg },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 }, q: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: P.border, backgroundColor: P.bg },
});
