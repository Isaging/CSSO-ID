import AsyncStorage from '@react-native-async-storage/async-storage';

const DB_KEY = 'csso_db_v1';

export const INITIAL_STATE = {
  members: {}, // token -> { token, student_no, full_name, status, points, print_balance, valid_until }
  logs: [],    // [{ id, time, officer, student_no, name, action, amount, balance_after, note, synced }]
  settings: {
    officer: 'Officer',
    sheet_url: '',
    secret: '',
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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function searchMembers(membersMap, query) {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim().toLowerCase();
  return Object.values(membersMap)
    .filter(
      (m) =>
        (m.full_name && m.full_name.toLowerCase().includes(q)) ||
        (m.student_no && m.student_no.toLowerCase().includes(q))
    )
    .slice(0, 5);
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

// Undo the last print transaction
export function undoLastPrint(state, logId) {
  const logIndex = state.logs.findIndex((l) => l.id === logId);
  if (logIndex === -1) return { ok: false, error: 'Transaction not found' };

  const targetLog = state.logs[logIndex];
  if (targetLog.action !== 'print') {
    return { ok: false, error: 'Only print transactions can be undone here' };
  }

  const member = Object.values(state.members).find(
    (m) => m.student_no === targetLog.student_no || m.token === targetLog.token
  );

  let updatedMembers = { ...state.members };
  if (member) {
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
  const parsedNewAmt = Math.round(parseFloat(newAmount) * 100) / 100;
  if (isNaN(parsedNewAmt) || parsedNewAmt < 0) {
    return { ok: false, error: 'Invalid new amount' };
  }

  const diff = Math.round((oldLog.amount - parsedNewAmt) * 100) / 100;

  const member = Object.values(state.members).find(
    (m) => m.student_no === oldLog.student_no || m.token === oldLog.token
  );

  let updatedMembers = { ...state.members };
  if (member) {
    const updatedBal = Math.round(((member.print_balance || 0) + diff) * 100) / 100;
    if (updatedBal < 0) {
      return { ok: false, error: 'Member does not have enough balance for this increase' };
    }
    updatedMembers[member.token] = {
      ...member,
      print_balance: updatedBal,
    };
  }

  const updatedLog = {
    ...oldLog,
    amount: parsedNewAmt,
    balance_after: Math.round(((oldLog.balance_after || 0) + diff) * 100) / 100,
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
export function voidPrintLog(state, logId) {
  return undoLastPrint(state, logId);
}