import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const KEY = 'csso_db_v1', KEEP_SYNCED = 500;
export let db = { members: {}, logs: [], settings: { officer: '', url: '', key: '' } };
const subs = new Set();
export const subscribe = f => { subs.add(f); return () => subs.delete(f); };
const emit = () => subs.forEach(f => f());
let lastTap = { t: null, at: 0 }, syncing = false;

export async function load() {
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s) { const d = JSON.parse(s); db = { members: d.members || {}, logs: d.logs || [], settings: { ...db.settings, ...d.settings } }; }
  } catch (e) {}
  emit();
}
async function save() {
  const synced = db.logs.filter(l => l.synced);          // phone keeps all unsent + the last 500 sent; the Sheet keeps history
  if (synced.length > KEEP_SYNCED) { const drop = new Set(synced.slice(0, synced.length - KEEP_SYNCED).map(l => l.id)); db.logs = db.logs.filter(l => !drop.has(l.id)); }
  await AsyncStorage.setItem(KEY, JSON.stringify(db));
  emit();
}
export const pending = () => db.logs.filter(l => !l.synced).length;
export const tokenFrom = s => { s = String(s); const a = s.match(/[?&]t=([A-Za-z0-9_-]{8,64})/) || s.match(/\/t\/([A-Za-z0-9_-]{8,64})/); return a ? a[1] : null; };
const peso = n => '₱' + Number(n).toFixed(2);
const expired = m => m.valid_until && new Date(m.valid_until + 'T23:59:59') < new Date();
const logRow = (m, action, amount, after) => {
  const l = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10), t: new Date().toISOString(), officer: db.settings.officer,
    student_no: m.student_no, name: m.full_name, action, amount: amount ?? '', balance_after: after ?? '', note: '', synced: false };
  db.logs.push(l); return l;
};

export async function tap(token, mode) {
  const now = Date.now();
  if (token === lastTap.t && now - lastTap.at < 3000) return null;
  lastTap = { t: token, at: now };
  const m = db.members[token];
  if (!m) return { k: 'bad', title: 'ID not recognized', sub: 'Import the latest member list.' };
  if (m.status !== 'active') return { k: 'warn', title: m.full_name, sub: 'Membership inactive.' };
  if (expired(m)) return { k: 'warn', title: m.full_name, sub: 'Membership expired ' + m.valid_until + '.' };
  if (mode === 'print') return { k: 'ok', title: m.full_name, sub: 'Balance: ' + peso(m.print_balance), print: token };
  let p = null;
  for (let i = db.logs.length - 1; i >= 0; i--) { const l = db.logs[i]; if (l.student_no === m.student_no && (l.action === 'office_in' || l.action === 'office_out')) { p = l; break; } }
  const age = p ? now - new Date(p.t).getTime() : Infinity;
  if (age < 10000) return { k: 'warn', title: m.full_name, sub: 'Already logged just now.' };
  const a = p && p.action === 'office_in' && age < 16 * 3600e3 ? 'office_out' : 'office_in';
  const l = logRow(m, a); await save(); sync();
  return { k: 'ok', title: m.full_name, sub: (a === 'office_in' ? 'TIME IN' : 'TIME OUT') + ' at ' + new Date(l.t).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) };
}

export async function deduct(token, a) {
  const m = db.members[token];
  if (!m) return { k: 'bad', title: 'Scan an ID first' };
  if (!(a > 0 && a <= 1000)) return { k: 'bad', title: 'Enter a valid amount' };
  if (m.print_balance < a) return { k: 'bad', title: 'Not enough balance', sub: m.full_name + ' has ' + peso(m.print_balance) };
  m.print_balance = Math.round((m.print_balance - a) * 100) / 100;
  logRow(m, 'print', a, m.print_balance); await save(); sync(); lastTap = { t: null, at: 0 };
  return { k: 'ok', title: 'Deducted ' + peso(a), sub: m.full_name + ' now has ' + peso(m.print_balance) };
}

// ---- CSV ----
function parseCSV(t) {
  t = t.replace(/^\ufeff/, ''); const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
    else c += ch;
  }
  r.push(c); if (r.some(x => x.trim())) rows.push(r); return rows;
}
const cell = v => { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v) && isNaN(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

async function importMembers(text) {
  const rows = parseCSV(text); if (rows.length < 2) throw new Error('File looks empty.');
  const h = rows[0].map(x => x.trim().toLowerCase()), ix = n => h.indexOf(n);
  if (ix('token') < 0) throw new Error("Missing a 'token' column.");
  let add = 0, upd = 0;
  for (const r of rows.slice(1)) {
    const g = n => ix(n) >= 0 ? (r[ix(n)] || '').trim() : undefined, tk = g('token'); if (!tk) continue;
    const old = db.members[tk], m = old || { token: tk, status: 'active', points: 0, print_balance: 40, valid_until: '' };
    for (const k of ['student_no', 'full_name', 'status', 'valid_until']) { const v = g(k); if (v !== undefined && (v !== '' || k !== 'status')) m[k] = v; }
    for (const k of ['points', 'print_balance']) { const v = g(k); if (v !== undefined && v !== '' && !isNaN(v)) m[k] = Number(v); }
    db.members[tk] = m; old ? upd++ : add++;
  }
  await save(); return { add, upd };
}
export async function pickAndImport() {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  return importMembers(await new File(r.assets[0].uri).text());
}

async function exportCSV(name, rows) {
  const f = new File(Paths.cache, name); if (f.exists) f.delete(); f.create();
  f.write('\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n'));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: name });
}
const COLS = ['id', 'time', 'officer', 'student_no', 'name', 'action', 'amount', 'balance_after', 'note'];
const row = l => [l.id, l.t, l.officer, l.student_no, l.name, l.action, l.amount, l.balance_after, l.note];
const day = () => new Date().toISOString().slice(0, 10);
export async function exportNew() { const r = db.logs.filter(l => !l.synced); if (!r.length) return null; await exportCSV('csso_new_' + day() + '.csv', [COLS, ...r.map(row)]); return r.map(l => l.id); }
export const exportAll = () => exportCSV('csso_recent_' + day() + '.csv', [COLS, ...db.logs.map(row)]);
export const exportMembers = () => exportCSV('csso_members_' + day() + '.csv', [['token', 'student_no', 'full_name', 'status', 'points', 'print_balance', 'valid_until'], ...Object.values(db.members).map(m => [m.token, m.student_no, m.full_name, m.status, m.points, m.print_balance, m.valid_until])]);
export async function markSynced(ids) { const s = new Set(ids); db.logs.forEach(l => { if (s.has(l.id)) l.synced = true; }); await save(); }

// ---- Sync to Google Sheet (Apps Script receiver) ----
export async function saveSettings(s) { db.settings = { ...db.settings, ...s }; await save(); sync(); }
export async function sync(manual) {
  const s = db.settings;
  if (syncing) return manual ? 'Sync already running.' : null;
  if (!s.url) return manual ? 'Add a Sync URL in Settings.' : null;
  const rows = db.logs.filter(l => !l.synced);
  if (!rows.length) return manual ? 'Everything is already sent.' : null;
  syncing = true;
  try {
    const res = await fetch(s.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ key: s.key, rows: rows.map(({ synced, ...r }) => r) }) });
    const j = await res.json();
    if (j.ok) { await markSynced(j.ids); return manual ? 'Sent ' + rows.length + ' record(s).' : null; }
    return manual ? 'Server said no: ' + (j.error || 'unknown') : null;
  } catch (e) { return manual ? 'Couldn’t reach the server. Will retry when online.' : null; }
  finally { syncing = false; }
}
