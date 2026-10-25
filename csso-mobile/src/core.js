import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DB_KEY = 'csso_db_v1';

export const ROLES = ['admin', 'officer', 'encrypts', 'member'];
export const STATUSES = ['active', 'expired', 'inactive'];
const WORKING_ROLES = ['admin', 'officer', 'encrypts'];
const ADMIN_ACTIONS = ['members', 'issue', 'settings', 'import'];
const ADMIN_KEY_MIN = 8;
const MAX_ADMIN_TRIES = 5;
const ADMIN_LOCK_MS = 60 * 1000;

export const INITIAL_STATE = {
  members: {}, // token -> { token, student_no, full_name, role, status, print_balance, valid_until, tag_locked }
  logs: [],    // [{ id, time, operator, operator_role, student_no, name, action, amount, balance_after, note, synced }]
  settings: {
    officer: 'Officer',
    role: 'officer',
    sheet_url: '',
    secret: '',
    link_prefix: '',
    admin_key_hash: '',
    admin_key_salt: '',
    admin_fail_count: 0,
    admin_lock_until: 0,
  },
};

function roleOf(member) {
  return ROLES.includes(member && member.role) ? member.role : 'member';
}

// Permissions are enforced here, never only by hiding a button.
export function can(session, action) {
  if (!session) return false;
  if (session.member && (session.member.status || 'active') !== 'active') return false;
  const role = ROLES.includes(session.role) ? session.role : 'member';

  if (action === 'office_tab' || action === 'office') {
    return role === 'officer' || role === 'admin';
  }
  if (action === 'printing_tab' || action === 'printing' || action === 'edit_print') {
    return WORKING_ROLES.includes(role);
  }
  if (action === 'data_tab' || action === 'data' || action === 'sync' || action === 'export_new') {
    return WORKING_ROLES.includes(role);
  }
  if (action === 'export_recent' || action === 'export_members') {
    return role === 'officer' || role === 'admin';
  }
  if (action === 'members_tab' || action === 'issue_tab') {
    return role === 'officer' || role === 'admin';
  }
  if (ADMIN_ACTIONS.includes(action)) {
    return (role === 'officer' || role === 'admin') && Boolean(session.adminUnlocked);
  }
  return false;
}

export function todayManila() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isValidDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isRetentionPast(member) {
  return Boolean(member && member.valid_until && todayManila() > member.valid_until);
}

function operatorInfo(state, operator, operatorRole) {
  const name = (operator || state.settings.officer || 'Officer').trim() || 'Officer';
  const role = ROLES.includes(operatorRole) ? operatorRole : state.settings.role || 'officer';
  return { officer: name, operator: name, operator_role: role };
}

function memberStatusLog(state, member, note, operator, operatorRole, identity = {}) {
  const op = operatorInfo(state, operator, operatorRole);
  return {
    id: generateUUID(),
    time: new Date().toISOString(),
    ...op,
    student_no: identity.student_no || member.student_no || '',
    name: identity.name || member.full_name || '',
    action: 'member_status',
    amount: 0,
    balance_after: Math.round(parseFloat(member.print_balance || 0) * 100) / 100,
    note: note ? note.trim() : '',
    synced: false,
    token: identity.token !== undefined ? identity.token : member.token,
  };
}

function memberBlockedReason(member) {
  if (!member) return 'Member not found in database';
  if (member.status === 'expired') return 'Membership expired. Renew it first.';
  if (member.status === 'inactive') return 'Member account is inactive.';
  return null;
}

export async function loadDB() {
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw);
    return {
      members: parsed.members || {},
      logs: parsed.logs || [],
      settings: { ...INITIAL_STATE.settings, ...(parsed.settings || {}) },
    };
  } catch (err) {
    console.error('Failed to load DB', err);
    return INITIAL_STATE;
  }
}

export async function saveDB(state) {
  try {
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save DB', err);
  }
}

function normalizeAdminKey(key) {
  return String(key || '').trim();
}

async function hashAdminKey(key, salt) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${normalizeAdminKey(key)}`
  );
}

export async function setAdminKey(state, key) {
  const clean = normalizeAdminKey(key);
  if (clean.length < ADMIN_KEY_MIN) {
    return { ok: false, error: `Use at least ${ADMIN_KEY_MIN} characters.` };
  }
  const salt =
    typeof Crypto.randomUUID === 'function' ? Crypto.randomUUID() : generateUUID();
  const hash = await hashAdminKey(clean, salt);
  const nextState = {
    ...state,
    settings: {
      ...state.settings,
      admin_key_hash: hash,
      admin_key_salt: salt,
      admin_fail_count: 0,
      admin_lock_until: 0,
    },
  };
  return { ok: true, nextState };
}

export async function verifyAdminKey(state, key) {
  const now = Date.now();
  const lockUntil = Number(state.settings.admin_lock_until || 0);
  if (lockUntil > now) {
    const seconds = Math.ceil((lockUntil - now) / 1000);
    return {
      ok: false,
      locked: true,
      error: `Too many attempts. Try again in ${seconds}s.`,
      nextState: state,
    };
  }
  if (!state.settings.admin_key_hash || !state.settings.admin_key_salt) {
    return { ok: false, noKey: true, error: 'No Admin Master Key set yet.', nextState: state };
  }
  const clean = normalizeAdminKey(key);
  if (!clean) {
    return { ok: false, error: 'Enter the Admin Master Key.', nextState: state };
  }
  const hash = await hashAdminKey(clean, state.settings.admin_key_salt);
  if (hash === state.settings.admin_key_hash) {
    return {
      ok: true,
      nextState: {
        ...state,
        settings: { ...state.settings, admin_fail_count: 0, admin_lock_until: 0 },
      },
    };
  }

  const fails = Number(state.settings.admin_fail_count || 0) + 1;
  if (fails >= MAX_ADMIN_TRIES) {
    return {
      ok: false,
      locked: true,
      error: 'Too many attempts. Locked for 1 minute.',
      nextState: {
        ...state,
        settings: {
          ...state.settings,
          admin_fail_count: 0,
          admin_lock_until: now + ADMIN_LOCK_MS,
        },
      },
    };
  }
  return {
    ok: false,
    error: `Wrong key. ${MAX_ADMIN_TRIES - fails} ${
      MAX_ADMIN_TRIES - fails === 1 ? 'try' : 'tries'
    } left.`,
    nextState: {
      ...state,
      settings: { ...state.settings, admin_fail_count: fails },
    },
  };
}

export function signInWithToken(state, rawToken) {
  const token = tokenFrom(rawToken) || String(rawToken || '').trim();
  const member = state.members[token];
  if (!member) return { ok: false, error: 'Unknown ID card. Import the member list first.' };
  if ((member.status || 'active') !== 'active') {
    return {
      ok: false,
      error:
        member.status === 'expired'
          ? 'Membership expired. Ask an admin to renew it.'
          : 'Member account is inactive.',
    };
  }
  const memberRole = roleOf(member);
  if (!WORKING_ROLES.includes(memberRole)) {
    return { ok: false, error: 'Regular members cannot sign in. Ask an officer for printing.' };
  }
  const signedIn = { ...member, role: memberRole };
  return {
    ok: true,
    member: signedIn,
    session: { member: signedIn, role: memberRole, adminUnlocked: false },
  };
}

function generateUUID() {
  if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Membership management (Admin Master Key required) ---

function money(value) {
  return Math.round(parseFloat(value || 0) * 100) / 100;
}

export function updateMember(
  state,
  { token, role, status, valid_until, resetBalance, operator, operatorRole, session }
) {
  if (!can(session, 'members')) {
    return { ok: false, error: 'Admin Master Key required to edit members.' };
  }
  const member = state.members[token];
  if (!member) return { ok: false, error: 'Member not found in database.' };

  const nextRole = ROLES.includes(role) ? role : roleOf(member);
  const nextStatus = STATUSES.includes(status) ? status : member.status || 'active';
  const nextValid = valid_until === undefined ? member.valid_until || '' : String(valid_until).trim();
  if (!isValidDate(nextValid)) {
    return { ok: false, error: 'Use YYYY-MM-DD for the retention date.' };
  }

  const oldBalance = money(member.print_balance);
  const newBalance = resetBalance && nextStatus === 'active' ? 40 : oldBalance;
  const updated = {
    ...member,
    role: nextRole,
    status: nextStatus,
    print_balance: newBalance,
    valid_until: nextValid,
  };

  const changes = [];
  if (roleOf(member) !== nextRole) changes.push(`role ${roleOf(member)} -> ${nextRole}`);
  if ((member.status || 'active') !== nextStatus) {
    changes.push(`status ${member.status || 'active'} -> ${nextStatus}`);
  }
  if ((member.valid_until || '') !== nextValid) {
    changes.push(`valid_until ${nextValid || 'cleared'}`);
  }
  if (oldBalance !== newBalance) {
    changes.push(`balance ₱${oldBalance.toFixed(2)} -> ₱${newBalance.toFixed(2)}`);
  }
  const note = changes.length ? changes.join('; ') : 'member details saved';

  return {
    ok: true,
    member: updated,
    nextState: {
      ...state,
      members: { ...state.members, [token]: updated },
      logs: [
        memberStatusLog(state, updated, note, operator, operatorRole),
        ...state.logs,
      ],
    },
  };
}

export function expireSemester(state, { keepToken, operator, operatorRole, session }) {
  if (!can(session, 'members')) {
    return { ok: false, error: 'Admin Master Key required to expire the semester.' };
  }
  const members = { ...state.members };
  const audits = [];
  Object.values(members).forEach((member) => {
    if (member.status === 'active' && member.token !== keepToken) {
      const updated = { ...member, status: 'expired' };
      members[member.token] = updated;
      audits.push(
        memberStatusLog(state, updated, 'semester expired', operator, operatorRole)
      );
    }
  });
  return {
    ok: true,
    count: audits.length,
    nextState: { ...state, members, logs: [...audits, ...state.logs] },
  };
}

function purgeMembers(state, list, operator, operatorRole) {
  const members = { ...state.members };
  const tokens = new Set();
  const studentNos = new Set();
  list.forEach((member) => {
    tokens.add(member.token);
    if (member.student_no) studentNos.add(member.student_no);
    delete members[member.token];
  });

  // Strip personal data from this phone's logs; keep the money trail.
  // shortcut: the Sheet keeps old rows. Add server-side redaction before relying on purge alone.
  const logs = state.logs.map((log) => {
    if (tokens.has(log.token) || (log.student_no && studentNos.has(log.student_no))) {
      return {
        ...log,
        name: 'Purged member',
        student_no: 'PURGED',
        token: '',
        note: [log.note, '[purged]'].filter(Boolean).join(' '),
      };
    }
    return log;
  });

  const audits = list.map((member) =>
    memberStatusLog(
      state,
      member,
      `data purged after ${member.valid_until || 'retention date'}`,
      operator,
      operatorRole,
      { name: 'Purged member', student_no: 'PURGED', token: '' }
    )
  );

  return {
    members,
    logs: [...audits, ...logs],
  };
}

export function purgeExpiredData(
  state,
  { keepToken, operator, operatorRole, session }
) {
  if (!can(session, 'members')) {
    return { ok: false, error: 'Admin Master Key required to purge data.' };
  }
  const eligible = Object.values(state.members).filter(
    (member) => isRetentionPast(member) && member.token !== keepToken
  );
  if (!eligible.length) {
    return { ok: true, count: 0, nextState: state };
  }
  return {
    ok: true,
    count: eligible.length,
    nextState: {
      ...state,
      ...purgeMembers(state, eligible, operator, operatorRole),
    },
  };
}

export function purgeMember(state, token, { operator, operatorRole, session }) {
  if (!can(session, 'members')) {
    return { ok: false, error: 'Admin Master Key required to purge data.' };
  }
  const member = state.members[token];
  if (!member) return { ok: false, error: 'Member not found in database.' };
  if (!isRetentionPast(member)) {
    return {
      ok: false,
      error: 'Retention date has not passed. Data cannot be purged yet.',
    };
  }
  if (token === session?.member?.token) {
    return { ok: false, error: 'Sign out before purging your own record.' };
  }
  return {
    ok: true,
    count: 1,
    nextState: {
      ...state,
      ...purgeMembers(state, [member], operator, operatorRole),
    },
  };
}

export function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const manila = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  let hour = manila.getUTCHours();
  const minute = String(manila.getUTCMinutes()).padStart(2, '0');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${minute} ${suffix}`;
}

export function searchMembers(membersMap, query, roles) {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim().toLowerCase();
  return Object.values(membersMap)
    .filter((m) => !roles || roles.includes(roleOf(m)))
    .filter(
      (m) =>
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.student_no && String(m.student_no).toLowerCase().includes(q)) ||
        (m.token && String(m.token).toLowerCase().includes(q))
    )
    .slice(0, 5);
}

// Pull the random token out of either supported sticker URL form.
export function tokenFrom(text) {
  if (!text) return null;
  const match = String(text).match(
    /[?&]t=([A-Za-z0-9_-]{8,64})|\/t\/([A-Za-z0-9_-]{8,64})/
  );
  return match ? match[1] || match[2] : null;
}

// Office in/out toggle. The last office action for the member decides the next one.
export function officeTap(
  state,
  { token, studentNo, note = '', operator, operatorRole, session }
) {
  if (!can(session, 'office')) {
    return { ok: false, error: 'Sign in as an officer to log office time.' };
  }
  const member =
    (token && state.members[token]) ||
    (studentNo
      ? Object.values(state.members).find((m) => m.student_no === studentNo)
      : null);

  const blocked = memberBlockedReason(member);
  if (blocked) return { ok: false, error: blocked };
  if (!WORKING_ROLES.includes(roleOf(member))) {
    return { ok: false, error: 'Office duty is only for working members.' };
  }

  const now = Date.now();
  const last = state.logs.find(
    (l) =>
      (l.token === member.token || l.student_no === member.student_no) &&
      (l.action === 'office_in' || l.action === 'office_out')
  );
  const lastAt = last ? new Date(last.time).getTime() : 0;

  if (lastAt && now - lastAt < 10000) {
    return { ok: false, error: 'Too soon — wait 10 seconds before tapping again' };
  }

  // A stale "in" (over 16h) starts a fresh session instead of logging "out".
  const action =
    !last || last.action === 'office_out' || now - lastAt > 16 * 60 * 60 * 1000
      ? 'office_in'
      : 'office_out';

  const op = operatorInfo(state, operator, operatorRole);
  const logEntry = {
    id: generateUUID(),
    time: new Date(now).toISOString(),
    ...op,
    student_no: member.student_no || '',
    name: member.full_name || '',
    action,
    amount: 0,
    balance_after: Math.round(parseFloat(member.print_balance || 0) * 100) / 100,
    note: note ? note.trim() : '',
    synced: false,
    token: member.token,
  };

  return {
    ok: true,
    log: logEntry,
    member,
    nextState: { ...state, logs: [logEntry, ...state.logs] },
  };
}

// Perform print deduction
export function deductPrint(
  state,
  { token, studentNo, amount, note, operator, operatorRole, session }
) {
  if (!can(session, 'printing')) {
    return { ok: false, error: 'Sign in as a working member to deduct printing.' };
  }
  const deductAmt = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(deductAmt) || deductAmt <= 0 || deductAmt > 1000) {
    return { ok: false, error: 'Amount must be between ₱0.01 and ₱1000.00' };
  }

  let member = null;
  if (token && state.members[token]) {
    member = state.members[token];
  } else if (studentNo) {
    member = Object.values(state.members).find((m) => m.student_no === studentNo);
  }

  const blocked = memberBlockedReason(member);
  if (blocked) return { ok: false, error: blocked };

  const currentBal = Math.round(parseFloat(member.print_balance || 0) * 100) / 100;
  if (currentBal < deductAmt) {
    return {
      ok: false,
      error: `Insufficient balance (Has: ₱${currentBal.toFixed(2)}, Needs: ₱${deductAmt.toFixed(2)})`,
    };
  }

  const newBal = Math.round((currentBal - deductAmt) * 100) / 100;

  const op = operatorInfo(state, operator, operatorRole);
  const logEntry = {
    id: generateUUID(),
    time: new Date().toISOString(),
    ...op,
    student_no: member.student_no || '',
    name: member.full_name || '',
    action: 'print',
    amount: deductAmt,
    balance_after: newBal,
    note: note ? note.trim() : '',
    synced: false,
    token: member.token,
  };

  const updatedMembers = {
    ...state.members,
    [member.token]: {
      ...member,
      print_balance: newBal,
    },
  };

  const updatedLogs = [logEntry, ...state.logs];

  return {
    ok: true,
    log: logEntry,
    member: updatedMembers[member.token],
    nextState: {
      ...state,
      members: updatedMembers,
      logs: updatedLogs,
    },
  };
}

// Walk-in non-member printing. Never touches a member balance.
export function logGuestPrint(
  state,
  { amount, note, name, studentNo, operator, operatorRole, session }
) {
  if (!can(session, 'printing')) {
    return { ok: false, error: 'Sign in as a working member to log printing.' };
  }
  const paidAmt = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(paidAmt) || paidAmt <= 0 || paidAmt > 1000) {
    return { ok: false, error: 'Amount must be between ₱0.01 and ₱1000.00' };
  }

  const op = operatorInfo(state, operator, operatorRole);
  const logEntry = {
    id: generateUUID(),
    time: new Date().toISOString(),
    ...op,
    student_no: (studentNo || '').trim() || 'ANON',
    name: (name || '').trim() || 'Anonymous',
    action: 'print_guest',
    amount: paidAmt,
    balance_after: '',
    note: note ? note.trim() : '',
    synced: false,
    token: '',
  };

  return {
    ok: true,
    log: logEntry,
    nextState: { ...state, logs: [logEntry, ...state.logs] },
  };
}

// Undo the last print transaction
export function undoLastPrint(state, logId, session) {
  if (!can(session, 'edit_print')) {
    return { ok: false, error: 'Sign in as a working member to undo prints.' };
  }
  const logIndex = state.logs.findIndex((l) => l.id === logId);
  if (logIndex === -1) return { ok: false, error: 'Transaction not found' };

  const targetLog = state.logs[logIndex];
  const isGuest = targetLog.action === 'print_guest';
  if (targetLog.action !== 'print' && !isGuest) {
    return { ok: false, error: 'Only print transactions can be undone here' };
  }

  const member = Object.values(state.members).find(
    (m) => m.student_no === targetLog.student_no || m.token === targetLog.token
  );

  let updatedMembers = { ...state.members };
  if (!isGuest && member) {
    const restoredBal = Math.round(((member.print_balance || 0) + targetLog.amount) * 100) / 100;
    updatedMembers[member.token] = {
      ...member,
      print_balance: restoredBal,
    };
  }

  const updatedLogs = state.logs.filter((l) => l.id !== logId);

  return {
    ok: true,
    nextState: {
      ...state,
      members: updatedMembers,
      logs: updatedLogs,
    },
  };
}

// Edit existing print log amount & note
export function editPrintLog(state, { logId, newAmount, newNote, session }) {
  if (!can(session, 'edit_print')) {
    return { ok: false, error: 'Sign in as a working member to edit prints.' };
  }
  const logIndex = state.logs.findIndex((l) => l.id === logId);
  if (logIndex === -1) return { ok: false, error: 'Log not found' };

  const oldLog = state.logs[logIndex];
  const isGuest = oldLog.action === 'print_guest';
  if (oldLog.action !== 'print' && !isGuest) {
    return { ok: false, error: 'Only print transactions can be edited here' };
  }

  const parsedNewAmt = Math.round(parseFloat(newAmount) * 100) / 100;
  if (isNaN(parsedNewAmt) || parsedNewAmt <= 0 || parsedNewAmt > 1000) {
    return { ok: false, error: 'New amount must be between ₱0.01 and ₱1000.00' };
  }

  const diff = Math.round((oldLog.amount - parsedNewAmt) * 100) / 100;

  const member = Object.values(state.members).find(
    (m) => m.student_no === oldLog.student_no || m.token === oldLog.token
  );

  let updatedMembers = { ...state.members };
  if (!isGuest && member) {
    const updatedBal = Math.round(((member.print_balance || 0) + diff) * 100) / 100;
    if (updatedBal < 0) {
      return { ok: false, error: 'Member does not have enough balance for this increase' };
    }
    updatedMembers[member.token] = {
      ...member,
      print_balance: updatedBal,
    };
  }

  // shortcut: edited rows keep their id, so a synced row is skipped by the receiver.
  // Upgrade to a new UUID + "[edited ... ref:<id>]" before turning sync on.
  const updatedLog = {
    ...oldLog,
    amount: parsedNewAmt,
    balance_after: isGuest
      ? ''
      : Math.round(((oldLog.balance_after || 0) + diff) * 100) / 100,
    note: newNote,
    synced: false,
  };

  const updatedLogs = [...state.logs];
  updatedLogs[logIndex] = updatedLog;

  return {
    ok: true,
    nextState: {
      ...state,
      members: updatedMembers,
      logs: updatedLogs,
    },
  };
}

// Void & Refund full amount
// shortcut: removing a synced row only edits this phone; the Sheet keeps the old row.
// Upgrade to a "[voided ref:<id>]" correction row before turning sync on.
export function voidPrintLog(state, logId, session) {
  return undoLastPrint(state, logId, session);
}