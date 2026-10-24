import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_KEY = 'csso_db_v1';

export const INITIAL_STATE = {
  members: {}, // token -> { token, student_no, full_name, role, status, print_balance, valid_until }
  logs: [],    // [{ id, time, operator, operator_role, student_no, name, action, amount, balance_after, note, synced }]
  settings: {
    officer: 'Officer',
    role: 'officer',
    sheet_url: '',
    secret: '',
    link_prefix: '',
  },
};

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

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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

export function searchMembers(membersMap, query) {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim().toLowerCase();
  return Object.values(membersMap)
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
export function officeTap(state, { token, studentNo, note = '' }) {
  const member =
    (token && state.members[token]) ||
    (studentNo
      ? Object.values(state.members).find((m) => m.student_no === studentNo)
      : null);

  if (!member) return { ok: false, error: 'Member not found in database' };
  if (member.status === 'inactive') {
    return { ok: false, error: 'Member account is inactive' };
  }
  if (member.valid_until && new Date(member.valid_until) < new Date()) {
    return { ok: false, error: 'Member ID has expired' };
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

  const logEntry = {
    id: generateUUID(),
    time: new Date(now).toISOString(),
    officer: state.settings.officer || 'Officer',
    operator: state.settings.officer || 'Officer',
    operator_role: state.settings.role || 'officer',
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
export function deductPrint(state, { token, studentNo, amount, note }) {
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

  if (!member) {
    return { ok: false, error: 'Member not found in database' };
  }

  if (member.status === 'inactive') {
    return { ok: false, error: 'Member account is inactive' };
  }

  if (member.valid_until && new Date(member.valid_until) < new Date()) {
    return { ok: false, error: 'Member ID has expired' };
  }

  const currentBal = Math.round(parseFloat(member.print_balance || 0) * 100) / 100;
  if (currentBal < deductAmt) {
    return {
      ok: false,
      error: `Insufficient balance (Has: ₱${currentBal.toFixed(2)}, Needs: ₱${deductAmt.toFixed(2)})`,
    };
  }

  const newBal = Math.round((currentBal - deductAmt) * 100) / 100;

  const logEntry = {
    id: generateUUID(),
    time: new Date().toISOString(),
    officer: state.settings.officer || 'Officer',
    operator: state.settings.officer || 'Officer',
    operator_role: state.settings.role || 'officer',
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
export function logGuestPrint(state, { amount, note, name, studentNo }) {
  const paidAmt = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(paidAmt) || paidAmt <= 0 || paidAmt > 1000) {
    return { ok: false, error: 'Amount must be between ₱0.01 and ₱1000.00' };
  }

  const logEntry = {
    id: generateUUID(),
    time: new Date().toISOString(),
    officer: state.settings.officer || 'Officer',
    operator: state.settings.officer || 'Officer',
    operator_role: state.settings.role || 'officer',
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
export function undoLastPrint(state, logId) {
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
export function editPrintLog(state, { logId, newAmount, newNote }) {
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
export function voidPrintLog(state, logId) {
  return undoLastPrint(state, logId);
}