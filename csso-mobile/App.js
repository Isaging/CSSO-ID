import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  can,
  deductPrint,
  editPrintLog,
  expireSemester,
  formatTime,
  isRetentionPast,
  loadDB,
  logGuestPrint,
  officeTap,
  purgeExpiredData,
  purgeMember,
  saveDB,
  searchMembers,
  signInWithToken,
  todayManila,
  undoLastPrint,
  updateMember,
  verifyAdminMasterKey,
  voidPrintLog,
} from './src/core';

const C = {
  ink: '#082b33',
  deep: '#0a3d3d',
  forest: '#0f6354',
  teal: '#3e868e',
  leaf: '#3aa56c',
  mint: '#5ce09a',
  bg: '#eef5f3',
  card: '#ffffff',
  text: '#082b33',
  mute: '#4f6f72',
  line: '#d3e3e0',
  field: '#f6faf9',
  accent: '#0f6354',
  onaccent: '#ffffff',
  warn: '#b4531a',
  warnbg: '#fdf0e3',
  okbg: '#dff6e9',
  white: '#ffffff',
};

const TABS = [
  { key: 'office', label: 'Office', icon: '▤' },
  { key: 'printing', label: 'Printing', icon: '⎙' },
  { key: 'members', label: 'Members', icon: '▦' },
  { key: 'issue', label: 'Issue ID', icon: '▣' },
  { key: 'data', label: 'Data', icon: '☁' },
];

const ROLES = ['member', 'encrypts', 'officer', 'admin'];
const ROLE_LABELS = {
  member: 'Member',
  encrypts: 'Encrypts',
  officer: 'Officer',
  admin: 'Admin',
};
const STATUSES = ['active', 'expired', 'inactive'];
const STATUS_LABELS = { active: 'Active', expired: 'Expired', inactive: 'Inactive' };

function roleLabel(role) {
  return ROLE_LABELS[role] || 'Member';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || 'Active';
}

function today() {
  return todayManila();
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SectionTitle({ children, right }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

function Tag({ children, style, textStyle }) {
  return (
    <View style={[styles.tag, style]}>
      <Text style={[styles.tagText, textStyle]}>{children}</Text>
    </View>
  );
}

function SyncBadge({ synced }) {
  return (
    <View style={[styles.st, synced ? styles.stS : styles.stU]}>
      <Text style={[styles.stText, synced && styles.stTextS]}>
        {synced ? 'Synced' : 'Waiting'}
      </Text>
    </View>
  );
}

function MemberResults({ members, onPick, actionLabel = 'Use', showBalance = true }) {
  if (!members.length) return null;
  return (
    <View>
      {members.map((member) => (
        <View key={member.token || member.student_no} style={styles.hit}>
          <View style={styles.hitInfo}>
            <Text style={styles.hitName} numberOfLines={1}>
              {member.full_name || 'Unnamed member'}
            </Text>
            <Text style={styles.hitMeta} numberOfLines={1}>
              {member.student_no || '—'} · {roleLabel(member.role)}
              {showBalance ? ` · ₱${Number(member.print_balance || 0).toFixed(2)}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnSm}
            onPress={() => onPick(member)}
            accessibilityRole="button"
          >
            <Text style={styles.btnSmText}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    gap: 10,
  },
  loadingText: { color: C.mute, fontSize: 13, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.deep,
    borderBottomWidth: 3,
    borderBottomColor: C.mint,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.forest,
    borderWidth: 2,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: C.white, fontSize: 11, fontWeight: '800' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: C.white, fontSize: 17, fontWeight: '800' },
  headerSub: { color: '#9fd8cf', fontSize: 11.5, marginTop: 1 },
  headerRight: { alignItems: 'flex-end', gap: 5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#e9eef0',
  },
  pillOn: { backgroundColor: C.mint },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ink },
  pillText: { fontSize: 11.5, fontWeight: '700', color: C.ink },
  unsynced: {
    backgroundColor: '#f5b57a',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unsyncedText: { fontSize: 10.5, fontWeight: '800', color: '#3a1d05' },
  lockChip: {
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#9fd8cf',
  },
  lockChipText: { fontSize: 10.5, fontWeight: '800', color: '#9fd8cf' },

  main: { padding: 14, gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.mute,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  h2: { fontSize: 15, fontWeight: '800', color: C.text },
  muted: { color: C.mute, fontSize: 12.5, lineHeight: 18 },
  empty: { color: C.mute, fontSize: 13, paddingVertical: 6 },

  input: {
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 12,
    backgroundColor: C.field,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  label: { fontSize: 12.5, fontWeight: '700', color: C.mute, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stack: { gap: 8 },
  flex1: { flex: 1 },

  btn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: C.onaccent, fontSize: 14, fontWeight: '800' },
  btnAlt: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.line },
  btnAltText: { color: C.text, fontSize: 14, fontWeight: '800' },
  btnDanger: { backgroundColor: C.warnbg, borderWidth: 1, borderColor: '#f0c9a8' },
  btnDangerText: { color: C.warn, fontSize: 13.5, fontWeight: '800' },
  btnSm: { backgroundColor: C.accent, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10 },
  btnSmText: { color: C.onaccent, fontSize: 12.5, fontWeight: '800' },
  btnSmAlt: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.accent },
  btnSmAltText: { color: C.accent, fontSize: 12.5, fontWeight: '800' },
  btnBlock: { width: '100%' },

  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1 },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.field,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  hitInfo: { flex: 1, minWidth: 0 },
  hitName: { fontSize: 13.5, fontWeight: '700', color: C.text },
  hitMeta: { fontSize: 11.5, color: C.mute, marginTop: 2 },

  tap: {
    backgroundColor: C.deep,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  tapGlow: {
    position: 'absolute',
    top: -70,
    left: -40,
    right: -40,
    height: 180,
    backgroundColor: C.forest,
    borderRadius: 100,
    opacity: 0.5,
  },
  tapRingOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(92,224,154,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapRingMid: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(92,224,154,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapRingInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapRingText: { color: C.ink, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tapTitle: { color: C.white, fontSize: 16, fontWeight: '800', marginTop: 10 },
  tapSub: { color: '#9fd8cf', fontSize: 12, marginTop: 2, textAlign: 'center' },

  res: {
    backgroundColor: C.okbg,
    borderWidth: 1.5,
    borderColor: '#9edcba',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  resBad: { backgroundColor: C.warnbg, borderColor: '#efc4a2' },
  resTag: {
    alignSelf: 'flex-start',
    backgroundColor: C.accent,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 5,
  },
  resTagBad: { backgroundColor: C.warn },
  resTagText: { color: C.white, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  resTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  resMeta: { fontSize: 12.5, color: C.mute, marginTop: 2 },
  txBig: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 4 },
  txActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },

  li: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  liFirst: { borderTopWidth: 0 },
  liTime: { width: 62, fontSize: 11.5, color: C.mute, fontWeight: '600' },
  liMid: { flex: 1, minWidth: 0 },
  liName: { fontSize: 13.5, fontWeight: '700', color: C.text },
  liNote: { fontSize: 11.5, color: C.mute, marginTop: 1 },
  liRight: { alignItems: 'flex-end', gap: 3 },
  liAmt: { fontSize: 14, fontWeight: '800', color: C.text },
  st: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  stU: { backgroundColor: C.warnbg },
  stS: { backgroundColor: C.okbg },
  stText: { fontSize: 10, fontWeight: '800', color: C.warn },
  stTextS: { color: C.accent },

  seg: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 4,
  },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 9 },
  segOn: { backgroundColor: C.deep },
  segText: { fontSize: 13, fontWeight: '700', color: C.mute },
  segTextOn: { color: C.white },
  segTiny: { fontSize: 11.5 },

  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  chip: { borderWidth: 1.5, borderColor: C.accent, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  chipOn: { backgroundColor: C.accent },
  chipOnText: { color: C.white },

  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: {
    flex: 1,
    backgroundColor: C.field,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 10,
  },
  statNum: { fontSize: 24, fontWeight: '800', color: C.accent },
  statLabel: { fontSize: 11.5, color: C.mute, marginTop: 2 },

  note: { backgroundColor: C.warnbg, borderRadius: 12, padding: 10, marginTop: 10 },
  noteText: { color: C.warn, fontSize: 12.5, lineHeight: 18 },

  nav: {
    flexDirection: 'row',
    backgroundColor: C.deep,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 7 },
  navOn: { backgroundColor: C.forest },
  navIcon: { fontSize: 17, fontWeight: '700', color: '#9fd8cf' },
  navIconOn: { color: C.white },
  navLabel: { fontSize: 10.5, fontWeight: '700', color: '#9fd8cf', marginTop: 2 },
  navLabelOn: { color: C.white },

  toast: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 84,
    backgroundColor: C.ink,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderLeftWidth: 5,
    borderLeftColor: C.mint,
    zIndex: 20,
    elevation: 8,
  },
  toastText: { color: C.white, fontSize: 13, fontWeight: '600' },

  modal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6,31,38,0.72)',
    zIndex: 100,
  },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetWrap: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  sheetSub: { fontSize: 12.5, color: C.mute, marginTop: 2, marginBottom: 6 },
  preview: {
    backgroundColor: C.field,
    borderRadius: 12,
    padding: 10,
    marginTop: 5,
  },
  previewBig: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 2 },
  previewLabel: { fontSize: 12, color: C.mute },
  modalBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalBtn: { flex: 1 },
  confirm: { backgroundColor: C.warnbg, borderRadius: 12, padding: 10, marginTop: 8 },
  confirmText: { fontSize: 12.5, color: C.warn, lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: 8, marginTop: 8 },

  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.line,
    borderRadius: 12,
    backgroundColor: C.field,
    paddingHorizontal: 12,
  },
  peso: { fontSize: 18, fontWeight: '800', color: C.mute, marginRight: 4 },
  amountInput: { flex: 1, paddingVertical: 10, fontSize: 20, fontWeight: '800', color: C.text },

  linkBox: { backgroundColor: C.ink, borderRadius: 12, padding: 12, marginTop: 8 },
  linkText: {
    color: C.mint,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  linkNote: { color: '#9fd8cf', fontSize: 11.5, marginTop: 4, lineHeight: 16 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  switchCopy: { flex: 1, marginRight: 10 },
  switchTitle: { fontSize: 13.5, fontWeight: '700', color: C.text },
  switchSub: { fontSize: 11.5, color: C.mute, marginTop: 1 },

  csvRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  csvBtn: { flexGrow: 1, flexBasis: '45%' },

  login: { flex: 1, backgroundColor: C.bg },
  loginScroll: { padding: 18, gap: 12, paddingBottom: 32 },
  loginBrand: { alignItems: 'center', marginTop: 6 },
  loginLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.deep,
    borderWidth: 3,
    borderColor: C.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginLogoText: { color: C.white, fontSize: 20, fontWeight: '800' },
  loginTitle: { fontSize: 23, fontWeight: '800', color: C.text, marginTop: 10 },
  loginSub: { fontSize: 13, color: C.mute, textAlign: 'center', marginTop: 4, lineHeight: 19 },
  loginStatusRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 9 },
  loginTap: {
    backgroundColor: C.deep,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  loginRule: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 8 },
  loginRuleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.mint,
    marginTop: 5,
  },
  loginRuleText: { flex: 1, color: C.white, fontSize: 12.5, lineHeight: 18 },
  loginNote: { color: C.mute, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  loginKey: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.accent },
  loginKeyText: { color: C.accent, fontSize: 14, fontWeight: '800' },

  memberRow: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 13,
    backgroundColor: C.field,
    padding: 11,
    marginTop: 8,
  },
  memberRowPast: { borderColor: '#f0c9a8', backgroundColor: C.warnbg },
  memberTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  memberName: { fontSize: 14, fontWeight: '800', color: C.text },
  memberMeta: { fontSize: 11.5, color: C.mute, marginTop: 2 },
  memberTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  tag: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.line },
  tagText: { fontSize: 10, fontWeight: '800', color: C.mute, letterSpacing: 0.3 },
  tagRole: { backgroundColor: '#e0f1ed' },
  tagRoleText: { color: C.accent },
  tagActive: { backgroundColor: C.okbg },
  tagActiveText: { color: C.accent },
  tagExpired: { backgroundColor: C.warnbg },
  tagExpiredText: { color: C.warn },
  tagInactive: { backgroundColor: '#e9eef0' },
  tagInactiveText: { color: C.mute },
  memberActions: { flexDirection: 'row', gap: 6, marginTop: 9, flexWrap: 'wrap' },
  memberAction: { flexGrow: 1 },
  memberBalance: { fontSize: 13, fontWeight: '800', color: C.text, marginTop: 5 },
  retentionWarn: { color: C.warn, fontSize: 11.5, fontWeight: '700', marginTop: 3 },
  retentionOk: { color: C.mute, fontSize: 11.5, marginTop: 3 },

  gate: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  gateIcon: { fontSize: 30 },
  gateTitle: { fontSize: 17, fontWeight: '800', color: C.text, textAlign: 'center' },
  gateText: { fontSize: 12.5, color: C.mute, textAlign: 'center', lineHeight: 18 },

  adminKeyBox: { backgroundColor: C.field, borderRadius: 12, padding: 10, marginTop: 8 },
  adminKeyText: { color: C.mute, fontSize: 12, lineHeight: 18 },
  errText: { color: C.warn, fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 12.5, color: C.mute, marginTop: 2, marginBottom: 8 },
  switchOnly: { marginTop: 8 },
});

export default function App() {
  const [activeTab, setActiveTab] = useState('office');
  const [isOnline, setIsOnline] = useState(false);
  const [db, setDb] = useState(null);
  const [toast, setToast] = useState('');
  const [session, setSession] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [adminPrompt, setAdminPrompt] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);

  const [memberQuery, setMemberQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [editingMember, setEditingMember] = useState(null);
  const [editRole, setEditRole] = useState('member');
  const [editStatus, setEditStatus] = useState('active');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editReset, setEditReset] = useState(false);
  const [confirmExpire, setConfirmExpire] = useState(false);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);
  const [confirmPurgeMember, setConfirmPurgeMember] = useState(false);

  const [amount, setAmount] = useState('15.00');
  const [note, setNote] = useState('');
  const [printMode, setPrintMode] = useState('member');
  const [printQuery, setPrintQuery] = useState('');
  const [officeQuery, setOfficeQuery] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestId, setGuestId] = useState('');
  const [lastPrint, setLastPrint] = useState(null);
  const [lastOffice, setLastOffice] = useState(null);

  const [editingLog, setEditingLog] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [confirmVoid, setConfirmVoid] = useState(false);

  const [issueMode, setIssueMode] = useState('new');
  const [issueName, setIssueName] = useState('');
  const [issueStudentNo, setIssueStudentNo] = useState('');
  const [issueRole, setIssueRole] = useState('member');
  const [issueValidUntil, setIssueValidUntil] = useState('');
  const [issueQuery, setIssueQuery] = useState('');
  const [issueMember, setIssueMember] = useState(null);
  const [issueLock, setIssueLock] = useState(true);

  const toastTimer = useRef(null);
  const lastTapTimeRef = useRef(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable));
    });
    loadDB().then(setDb);
    return unsubscribe;
  }, []);

  // Lock whenever the app leaves the foreground. The session is never persisted.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        setSession(null);
        setActiveTab('office');
        setAdminPrompt(false);
        setAdminKey('');
        setAdminError('');
        setEditingMember(null);
        setEditingLog(null);
        setConfirmExpire(false);
        setConfirmPurgeAll(false);
        setConfirmPurgeMember(false);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  };

  const updateState = async (nextState) => {
    setDb(nextState);
    await saveDB(nextState);
  };

  if (!db) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>Loading CSSO Officer…</Text>
      </SafeAreaView>
    );
  }

  const members = db.members || {};
  const logs = db.logs || [];
  const unsyncedCount = logs.filter((log) => !log.synced).length;
  const memberCount = Object.keys(members).length;
  // The Admin Master Key is a fixed, pre-computed salted SHA-256 digest (see core.js).
// Only the hash is known; the plaintext password is never stored on the phone.
const hasAdminKey = true;
  const operatorName = session?.member
    ? session.member.full_name || session.member.student_no || 'Officer'
    : session?.name || 'Admin';
  const operatorRole = session?.role || 'admin';
  const isAdminUnlocked = Boolean(session && can(session, 'members'));
  const visibleTabs = TABS.filter((tab) => can(session, `${tab.key}_tab`));
  const officeLogs = logs
    .filter((log) => log.action === 'office_in' || log.action === 'office_out')
    .slice(0, 10);
  const printLogs = logs
    .filter((log) => log.action === 'print' || log.action === 'print_guest')
    .slice(0, 10);
  const officeResults = searchMembers(members, officeQuery, [
    'admin',
    'officer',
    'encrypts',
  ]);
  const printResults = searchMembers(members, printQuery);
  const issueResults = searchMembers(members, issueQuery);
  const amountNumber = Math.max(0, Math.min(1000, parseFloat(amount) || 0));
  const amountLabel = amountNumber.toFixed(2);
  const linkPrefix = db.settings.link_prefix || 'https://your-domain/t/';
  const purgeCount = Object.values(members).filter(
    (member) => isRetentionPast(member) && member.token !== session?.member?.token
  ).length;

  const updateSetting = (key, value) => {
    if (!can(session, 'settings')) {
      showToast('Admin Master Key required to change settings.');
      return;
    }
    updateState({ ...db, settings: { ...db.settings, [key]: value } });
  };

  const lockApp = () => {
    setSession(null);
    setActiveTab('office');
    setAdminPrompt(false);
    setAdminKey('');
    setAdminKeyConfirm('');
    setAdminError('');
    setEditingMember(null);
    setEditingLog(null);
    setConfirmExpire(false);
    setConfirmPurgeAll(false);
    setConfirmPurgeMember(false);
  };

  const finishLogin = (nextSession) => {
    setSession(nextSession);
    setAdminPrompt(false);
    setAdminKey('');
    setAdminKeyConfirm('');
    setAdminError('');
    const firstTab =
      nextSession.role === 'encrypts'
        ? 'printing'
        : can(nextSession, 'office_tab')
          ? 'office'
          : 'printing';
    setActiveTab(firstTab);
    const name = nextSession.member
      ? nextSession.member.full_name || nextSession.member.student_no || 'Officer'
      : '';
    showToast(
      nextSession.member
        ? `Signed in as ${name} (${roleLabel(nextSession.role)}).`
        : 'Signed in with Admin Master Key.'
    );
  };

  const handleLoginToken = (rawToken) => {
    const res = signInWithToken(db, rawToken);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    finishLogin(res.session);
  };

  const handleLoginScan = async () => {
    if (Platform.OS === 'web') {
      showToast('NFC is not available in the browser preview. Pick a test card below.');
      return;
    }
    if (loginBusy) return;
    setLoginBusy(true);
    try {
      const nfc = require('./src/nfc');
      const supported = await nfc.initNfc();
      if (!supported) throw new Error('This device does not support NFC.');
      const token = await nfc.readOnce();
      if (!token) {
        showToast('No card found. Hold it against the top of the phone and try again.');
        return;
      }
      handleLoginToken(token);
    } catch (e) {
      showToast((e && e.message) || 'The NFC reader could not start.');
    } finally {
      setLoginBusy(false);
    }
  };

  const openAdminPrompt = () => {
    setAdminPrompt(true);
    setAdminKey('');
    setAdminKeyConfirm('');
    setAdminError('');
  };

  const handleAdminSubmit = async () => {
    if (adminBusy) return;

    setAdminBusy(true);
    try {
      const res = await verifyAdminMasterKey(adminKey, db, saveDB);
      if (!res.ok) {
        setAdminError(res.error);
        return;
      }
      if (session) {
        setSession({ ...session, adminUnlocked: true });
        setAdminPrompt(false);
        showToast('Admin tools unlocked.');
      } else {
        finishLogin({ member: null, role: 'admin', adminUnlocked: true, name: 'Admin' });
      }
      setAdminKey('');
      setAdminError('');
    } catch (e) {
      console.error('ADMIN_KEY_ERROR', e && e.message);
      setAdminError('Could not check the Admin Master Key on this device.');
    } finally {
      setAdminBusy(false);
    }
  };

  const openMemberEdit = (member) => {
    setEditingMember(member);
    setEditRole(member.role || 'member');
    setEditStatus(member.status || 'active');
    setEditValidUntil(member.valid_until || '');
    setEditReset(false);
    setConfirmPurgeMember(false);
  };

  const closeMemberEdit = () => {
    setEditingMember(null);
    setConfirmPurgeMember(false);
  };

  const handleSaveMember = async () => {
    if (!editingMember) return;
    const res = updateMember(db, {
      token: editingMember.token,
      role: editRole,
      status: editStatus,
      valid_until: editValidUntil,
      resetBalance: editReset,
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    await updateState(res.nextState);
    if (session?.member?.token === editingMember.token) {
      const updated = res.member;
      const stillActive = updated.status === 'active';
      const stillWorking = ['admin', 'officer', 'encrypts'].includes(updated.role);
      if (!stillActive || !stillWorking) {
        lockApp();
        showToast('Your member record changed. Please sign in again.');
        return;
      }
      setSession({ ...session, member: updated, role: updated.role });
      if (!can({ ...session, member: updated, role: updated.role }, `${activeTab}_tab`)) {
        setActiveTab('printing');
      }
    }
    closeMemberEdit();
    showToast('Member updated.');
  };

  const handleExpireSemester = async () => {
    const res = expireSemester(db, {
      keepToken: session?.member?.token,
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    await updateState(res.nextState);
    setConfirmExpire(false);
    showToast(
      res.count
        ? `Semester ended. ${res.count} member${res.count === 1 ? '' : 's'} set to expired.`
        : 'No active members to expire.'
    );
  };

  const handlePurgeAll = async () => {
    const res = purgeExpiredData(db, {
      keepToken: session?.member?.token,
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    await updateState(res.nextState);
    setConfirmPurgeAll(false);
    setMemberQuery('');
    showToast(
      res.count
        ? `Purged ${res.count} student record${res.count === 1 ? '' : 's'}.`
        : 'No records are past their retention date.'
    );
  };

  const handlePurgeMember = async () => {
    if (!editingMember) return;
    const res = purgeMember(db, editingMember.token, {
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    await updateState(res.nextState);
    closeMemberEdit();
    showToast('Student data purged. Personal details were removed from this phone.');
  };

  const filteredMembers = Object.values(members)
    .filter((member) => {
      const q = memberQuery.trim().toLowerCase();
      if (q) {
        const hit =
          (member.full_name && member.full_name.toLowerCase().includes(q)) ||
          (member.student_no && String(member.student_no).toLowerCase().includes(q)) ||
          (member.token && String(member.token).toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (memberFilter === 'expired') return member.status === 'expired';
      if (memberFilter === 'topurge') return isRetentionPast(member);
      return true;
    })
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const handleOfficePick = (member, manual = true) => {
    const res = officeTap(db, {
      token: member.token,
      studentNo: member.student_no,
      note: manual ? '[manual]' : '',
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      setLastOffice({ ok: false, error: res.error });
      showToast(res.error);
      return;
    }
    updateState(res.nextState);
    setLastOffice({ ok: true, log: res.log, member: res.member });
    setOfficeQuery('');
    showToast(`${res.log.name || 'Member'} timed ${res.log.action === 'office_in' ? 'in' : 'out'}.`);
  };

  const handlePrintPick = (member, manual = true) => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 3000) return;
    lastTapTimeRef.current = now;

    const cleanNote = [note.trim(), manual ? '[manual]' : ''].filter(Boolean).join(' ');
    const res = deductPrint(db, {
      token: member.token,
      studentNo: member.student_no,
      amount,
      note: cleanNote,
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      setLastPrint({ ok: false, error: res.error });
      showToast(res.error);
      return;
    }
    updateState(res.nextState);
    setLastPrint({ ok: true, log: res.log, member: res.member });
    setPrintQuery('');
    showToast(`Deducted ₱${res.log.amount.toFixed(2)} from ${res.log.name}.`);
  };

  const handleGuestPrint = () => {
    const res = logGuestPrint(db, {
      amount,
      note: note.trim(),
      name: guestName,
      studentNo: guestId,
      operator: operatorName,
      operatorRole,
      session,
    });
    if (!res.ok) {
      setLastPrint({ ok: false, error: res.error });
      showToast(res.error);
      return;
    }
    updateState(res.nextState);
    setLastPrint({ ok: true, log: res.log });
    setGuestName('');
    setGuestId('');
    showToast(`Logged ₱${res.log.amount.toFixed(2)} from ${res.log.name}.`);
  };

  const handleScan = async (mode) => {
    if (Platform.OS === 'web') {
      showToast('NFC is not available in the browser preview. Use search below.');
      return;
    }
    try {
      const nfc = require('./src/nfc');
      const supported = await nfc.initNfc();
      if (!supported) throw new Error('This device does not support NFC.');
      const token = await nfc.readOnce();
      if (!token) {
        showToast('No card found. Hold it against the top of the phone and try again.');
        return;
      }
      if (mode === 'office') handleOfficePick({ token }, false);
      else handlePrintPick({ token }, false);
    } catch (e) {
      showToast((e && e.message) || 'The NFC reader could not start. Use search below.');
    }
  };

  const handlePreset = (delta) => {
    const next = Math.min(1000, Math.max(0, (parseFloat(amount) || 0) + delta));
    setAmount(next.toFixed(2));
  };

  const handleUndo = (logId) => {
    const res = undoLastPrint(db, logId, session);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    updateState(res.nextState);
    if (lastPrint && lastPrint.log && lastPrint.log.id === logId) {
      const next = res.nextState.logs.find(
        (log) => log.action === 'print' || log.action === 'print_guest'
      );
      setLastPrint(next ? { ok: true, log: next } : null);
    }
    if (editingLog && editingLog.id === logId) setEditingLog(null);
    showToast('Transaction undone.');
  };

  const openEdit = (log) => {
    setEditingLog(log);
    setEditAmount(Number(log.amount).toFixed(2));
    setEditNote(log.note || '');
    setConfirmVoid(false);
  };

  const closeEdit = () => {
    setEditingLog(null);
    setConfirmVoid(false);
  };

  const getPreview = () => {
    if (!editingLog || editingLog.action === 'print_guest') return null;
    const newAmt = parseFloat(editAmount);
    if (isNaN(newAmt) || newAmt <= 0 || newAmt > 1000) return null;
    const diff = Math.round((editingLog.amount - newAmt) * 100) / 100;
    const before = Number(editingLog.balance_after || 0);
    const after = Math.round((before + diff) * 100) / 100;
    const diffLabel = diff >= 0 ? `(+₱${diff.toFixed(2)})` : `(-₱${Math.abs(diff).toFixed(2)})`;
    return { before, after, diffLabel };
  };

  const preview = getPreview();

  const handleSaveEdit = () => {
    if (!editingLog) return;
    const res = editPrintLog(db, {
      logId: editingLog.id,
      newAmount: editAmount,
      newNote: editNote,
      session,
    });
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    updateState(res.nextState);
    if (lastPrint && lastPrint.log && lastPrint.log.id === editingLog.id) {
      const updated = res.nextState.logs.find((log) => log.id === editingLog.id);
      if (updated) setLastPrint({ ok: true, log: updated });
    }
    closeEdit();
    showToast('Print log updated.');
  };

  const handleVoidRefund = () => {
    if (!editingLog) return;
    const res = voidPrintLog(db, editingLog.id, session);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    updateState(res.nextState);
    if (lastPrint && lastPrint.log && lastPrint.log.id === editingLog.id) {
      const next = res.nextState.logs.find(
        (log) => log.action === 'print' || log.action === 'print_guest'
      );
      setLastPrint(next ? { ok: true, log: next } : null);
    }
    closeEdit();
    showToast(`Refunded ₱${Number(editingLog.amount).toFixed(2)}.`);
  };

  const handleSync = () => {
    if (!can(session, 'sync')) {
      showToast('You do not have permission to sync.');
      return;
    }
    if (!db.settings.sheet_url || !db.settings.secret) {
      showToast('Add the receiver URL and secret key in settings first.');
      return;
    }
    showToast('Sync is not connected in this build. Export CSV to reconcile.');
  };

  const notReady = (label) => {
    showToast(`${label} is not connected in this build.`);
  };

  const renderUnlockCard = (title, text) => (
    <Card>
      <View style={styles.gate}>
        <Text style={styles.gateIcon}>🔐</Text>
        <Text style={styles.gateTitle}>{title}</Text>
        <Text style={styles.gateText}>{text}</Text>
        <TouchableOpacity
          style={[styles.btn, { alignSelf: 'stretch', marginTop: 8 }]}
          onPress={openAdminPrompt}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>Enter Admin Master Key</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  const renderLogin = () => {
    const previewMembers = Object.values(members)
      .filter(
        (member) =>
          member.status === 'active' &&
          ['admin', 'officer', 'encrypts'].includes(member.role || 'member')
      )
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.loginScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.loginBrand}>
            <View style={styles.loginLogo}>
              <Text style={styles.loginLogoText}>CS</Text>
            </View>
            <Text style={styles.loginTitle}>CSSO Officer</Text>
            <Text style={styles.loginSub}>
              Tap your officer or encrypts ID to start. Every action is recorded under your
              name.
            </Text>
            <View style={styles.loginStatusRow}>
              <TouchableOpacity
                style={[styles.pill, isOnline && styles.pillOn]}
                onPress={() =>
                  showToast(
                    isOnline
                      ? 'Online. Ready to sync.'
                      : 'Working offline. Logs stay on this phone.'
                  )
                }
                accessibilityRole="button"
              >
                <View style={styles.dot} />
                <Text style={styles.pillText}>{isOnline ? 'Online' : 'Offline'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginTap, loginBusy && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleLoginScan}
            disabled={loginBusy}
            accessibilityRole="button"
          >
            <View style={styles.tapGlow} />
            <View style={styles.tapRingOuter}>
              <View style={styles.tapRingMid}>
                <View style={styles.tapRingInner}>
                  <Text style={styles.tapRingText}>NFC</Text>
                </View>
              </View>
            </View>
            <Text style={styles.tapTitle}>
              {loginBusy ? 'Reading ID card…' : 'Tap officer or encrypts ID'}
            </Text>
            <Text style={styles.tapSub}>Hold the card near the top of the phone</Text>
            <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
              <View style={styles.loginRule}>
                <View style={styles.loginRuleDot} />
                <Text style={styles.loginRuleText}>
                  Officer ID → Office, Printing, Members, Issue ID, Data
                </Text>
              </View>
              <View style={styles.loginRule}>
                <View style={styles.loginRuleDot} />
                <Text style={styles.loginRuleText}>
                  Encrypts ID → Printing and Data sync only
                </Text>
              </View>
              <View style={styles.loginRule}>
                <View style={styles.loginRuleDot} />
                <Text style={styles.loginRuleText}>Member ID → access denied</Text>
              </View>
            </View>
          </TouchableOpacity>

          {Platform.OS === 'web' ? (
            <Card>
              <SectionTitle>Browser preview: pick a test card</SectionTitle>
              <Text style={styles.muted}>
                NFC is not available in the browser. This uses the same sign-in path as a
                real card tap.
              </Text>
              {previewMembers.length ? (
                previewMembers.map((member) => (
                  <TouchableOpacity
                    key={member.token}
                    style={styles.hit}
                    onPress={() => handleLoginToken(member.token)}
                    accessibilityRole="button"
                  >
                    <View style={styles.hitInfo}>
                      <Text style={styles.hitName} numberOfLines={1}>
                        {member.full_name}
                      </Text>
                      <Text style={styles.hitMeta} numberOfLines={1}>
                        {member.student_no || '—'} · {roleLabel(member.role)} · active
                      </Text>
                    </View>
                    <View style={styles.btnSm}>
                      <Text style={styles.btnSmText}>Tap</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.empty}>
                  No active working member on this phone. Set the Admin Master Key to sign
                  in for setup.
                </Text>
              )}
            </Card>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, styles.loginKey]}
            onPress={openAdminPrompt}
            accessibilityRole="button"
          >
            <Text style={styles.loginKeyText}>
              'Admin Master Key Login'
            </Text>
          </TouchableOpacity>

          <Text style={styles.loginNote}>
            Regular members cannot sign in. They receive printing only. The app locks when
            it goes to the background. Only a salted SHA-256 hash of the Admin Master Key is
            stored on this phone.
          </Text>

          <View style={styles.note}>
            <Text style={styles.noteText}>
              Lost NFC card or empty DB? Enter the Admin Master Key here to sign in directly
              as Admin without an NFC tap.
            </Text>
          </View>
        </ScrollView>

        {toast ? (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        {renderAdminPrompt()}
      </SafeAreaView>
    );
  };

  const renderMembers = () => {
    if (!can(session, 'members')) {
      return renderUnlockCard(
        'Admin tools locked',
        'Member status, semester rollover, data retention, and role changes need the Admin Master Key.'
      );
    }

    return (
      <>
        <Card>
          <SectionTitle
            right={<Text style={styles.muted}>{memberCount} members</Text>}
          >
            Semester & data retention actions
          </SectionTitle>
          <Text style={styles.muted}>
            End semester sets every active member to expired except you. Purge removes
            personal data after the retention date.
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnDanger, { marginTop: 10 }]}
            onPress={() => {
              setConfirmExpire(true);
              setConfirmPurgeAll(false);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.btnDangerText}>End Sem: Expire All Active</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDanger, { marginTop: 8 }]}
            onPress={() => {
              setConfirmPurgeAll(true);
              setConfirmExpire(false);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.btnDangerText}>
              Purge Past Valid-Until ({purgeCount})
            </Text>
          </TouchableOpacity>

          {confirmExpire ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                Expire every active member? Your own record stays active so you are not
                locked out. Audit rows will be added and synced.
              </Text>
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                  onPress={() => setConfirmExpire(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnAltText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnDanger, styles.modalBtn]}
                  onPress={handleExpireSemester}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnDangerText}>Expire Semester</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {confirmPurgeAll ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                Permanently delete {purgeCount} student record
                {purgeCount === 1 ? '' : 's'} past their retention date? Names and student
                numbers in local logs are replaced with “Purged member”.
              </Text>
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                  onPress={() => setConfirmPurgeAll(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnAltText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnDanger, styles.modalBtn]}
                  onPress={handlePurgeAll}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnDangerText}>Purge Data</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </Card>

        <Card>
          <SectionTitle
            right={
              <Text style={styles.muted}>
                {filteredMembers.length} shown
              </Text>
            }
          >
            Search & filter members
          </SectionTitle>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Search name, student no, or token…"
              placeholderTextColor={C.teal}
              value={memberQuery}
              onChangeText={setMemberQuery}
              autoCorrect={false}
            />
          </View>
          <View style={styles.chipRow}>
            {[
              ['all', 'All'],
              ['expired', 'Expired'],
              ['topurge', 'To purge'],
            ].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, memberFilter === key && styles.chipOn]}
                onPress={() => setMemberFilter(key)}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.chipText, memberFilter === key && styles.chipOnText]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredMembers.length ? (
            filteredMembers.map((member) => {
              const past = isRetentionPast(member);
              const status = member.status || 'active';
              const statusStyle =
                status === 'expired'
                  ? styles.tagExpired
                  : status === 'inactive'
                    ? styles.tagInactive
                    : styles.tagActive;
              const statusTextStyle =
                status === 'expired'
                  ? styles.tagExpiredText
                  : status === 'inactive'
                    ? styles.tagInactiveText
                    : styles.tagActiveText;
              return (
                <View
                  key={member.token}
                  style={[styles.memberRow, past && styles.memberRowPast]}
                >
                  <TouchableOpacity
                    style={styles.memberTop}
                    onPress={() => openMemberEdit(member)}
                    accessibilityRole="button"
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {member.full_name || 'Unnamed member'}
                      </Text>
                      <Text style={styles.memberMeta} numberOfLines={1}>
                        {member.student_no || '—'} · Token{' '}
                        {member.token
                          ? `${member.token.slice(0, 6)}…${member.token.slice(-4)}`
                          : '—'}
                        {member.tag_locked ? ' · Locked' : ''}
                      </Text>
                      <View style={styles.memberTags}>
                        <Tag style={styles.tagRole} textStyle={styles.tagRoleText}>
                          {roleLabel(member.role)}
                        </Tag>
                        <Tag style={statusStyle} textStyle={statusTextStyle}>
                          {statusLabel(status)}
                        </Tag>
                      </View>
                      <Text style={styles.memberBalance}>
                        Print balance: ₱{Number(member.print_balance || 0).toFixed(2)}
                      </Text>
                      <Text
                        style={past ? styles.retentionWarn : styles.retentionOk}
                      >
                        Retention: {member.valid_until || 'not set'}
                        {past ? ' · PASSED, eligible for purge' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.memberActions}>
                    <TouchableOpacity
                      style={[styles.btnSm, styles.btnSmAlt, styles.memberAction]}
                      onPress={() => openMemberEdit(member)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSmAltText}>Edit</Text>
                    </TouchableOpacity>
                    {past ? (
                      <TouchableOpacity
                        style={[styles.btnSm, styles.btnDanger, styles.memberAction]}
                        onPress={() => {
                          openMemberEdit(member);
                          setConfirmPurgeMember(true);
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnDangerText}>Purge data</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.empty}>
              No members match. Try a different search or filter.
            </Text>
          )}
        </Card>
      </>
    );
  };

  const renderAdminPrompt = () => (
    <Modal
      visible={adminPrompt}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setAdminPrompt(false);
        setAdminKey('');
        setAdminError('');
      }}
    >
      <View style={styles.modal}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setAdminPrompt(false);
            setAdminKey('');
            setAdminError('');
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Admin verification</Text>
              <Text style={styles.modalSub}>
                {session
                  ? `Signed in as ${operatorName} (${roleLabel(session.role)})`
                  : 'Emergency / direct Admin sign-in'}
              </Text>
              <Text style={styles.muted}>
                Enter the Admin Master Key to unlock Member Status, Sem Rollover, Issue ID,
                and Settings. Only a salted SHA-256 hash is stored on this phone.
              </Text>

              <Text style={styles.label}>Admin Master Key</Text>
              <TextInput
                style={styles.input}
                value={adminKey}
                onChangeText={(value) => {
                  setAdminKey(value);
                  setAdminError('');
                }}
                placeholder="Enter key"
                placeholderTextColor={C.teal}
                secureTextEntry
                autoCapitalize="none"
                autoFocus
              />

              {adminError ? <Text style={styles.errText}>{adminError}</Text> : null}

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                  onPress={() => {
                    setAdminPrompt(false);
                    setAdminKey('');
                    setAdminError('');
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnAltText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.modalBtn, adminBusy && { opacity: 0.6 }]}
                  onPress={handleAdminSubmit}
                  disabled={adminBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnText}>
                    {adminBusy ? 'Checking…' : 'Unlock Admin'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.adminKeyBox}>
                <Text style={styles.adminKeyText}>
                  Five wrong tries lock the key pad for one minute. Lost NFC card or empty
                  DB? The Master Key also grants direct Admin sign-in without an NFC tap.
                </Text>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderMemberEditModal = () => (
    <Modal
      visible={!!editingMember}
      transparent
      animationType="slide"
      onRequestClose={closeMemberEdit}
    >
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={closeMemberEdit} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled">
              {editingMember ? (
                <>
                  <Text style={styles.modalTitle}>Edit member status & role</Text>
                  <Text style={styles.modalSub}>
                    {editingMember.full_name || 'Unnamed member'} (
                    {editingMember.student_no || '—'})
                  </Text>
                  <Text style={styles.muted}>
                    Token: {editingMember.token || '—'} · Locked:{' '}
                    {editingMember.tag_locked ? 'Yes' : 'No'}
                  </Text>

                  <Text style={styles.label}>Org role (all are members)</Text>
                  <View style={styles.chipRow}>
                    {ROLES.map((roleKey) => (
                      <TouchableOpacity
                        key={roleKey}
                        style={[styles.chip, editRole === roleKey && styles.chipOn]}
                        onPress={() => setEditRole(roleKey)}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.chipText,
                            editRole === roleKey && styles.chipOnText,
                          ]}
                        >
                          {roleLabel(roleKey)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Sem membership status</Text>
                  <View style={styles.chipRow}>
                    {STATUSES.map((statusKey) => (
                      <TouchableOpacity
                        key={statusKey}
                        style={[styles.chip, editStatus === statusKey && styles.chipOn]}
                        onPress={() => {
                          setEditStatus(statusKey);
                          if (statusKey !== 'active') setEditReset(false);
                        }}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.chipText,
                            editStatus === statusKey && styles.chipOnText,
                          ]}
                        >
                          {statusLabel(statusKey)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.switchRow}>
                    <View style={styles.switchCopy}>
                      <Text style={styles.switchTitle}>
                        Reset print balance to ₱40.00
                      </Text>
                      <Text style={styles.switchSub}>
                        {editStatus === 'active'
                          ? 'Use on semester renewal.'
                          : 'Set status to Active first.'}
                      </Text>
                    </View>
                    <Switch
                      value={editReset}
                      onValueChange={setEditReset}
                      disabled={editStatus !== 'active'}
                      trackColor={{ false: C.line, true: C.teal }}
                      thumbColor={editReset ? C.mint : '#f4f3f4'}
                    />
                  </View>

                  <Text style={styles.label}>Data retention (valid_until)</Text>
                  <TextInput
                    style={styles.input}
                    value={editValidUntil}
                    onChangeText={setEditValidUntil}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.teal}
                    autoCapitalize="none"
                  />
                  <Text style={styles.muted}>
                    Keep data until {editValidUntil || 'not set'}. Today is {today()}.
                    {editValidUntil && editValidUntil < today()
                      ? ' This record is eligible for purge.'
                      : ' Purge unlocks after this date.'}
                  </Text>

                  <View style={styles.modalBtns}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                      onPress={closeMemberEdit}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnAltText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.modalBtn]}
                      onPress={handleSaveMember}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnText}>Save Changes</Text>
                    </TouchableOpacity>
                  </View>

                  {isRetentionPast(editingMember) ? (
                    <TouchableOpacity
                      style={[styles.btn, styles.btnDanger, { marginTop: 10 }]}
                      onPress={() => setConfirmPurgeMember(true)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnDangerText}>
                        Delete Student Data Now
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.muted, { marginTop: 10 }]}>
                      Delete Student Data Now unlocks after the retention date.
                    </Text>
                  )}

                  {confirmPurgeMember ? (
                    <View style={styles.confirm}>
                      <Text style={styles.confirmText}>
                        Delete {editingMember.full_name || 'this student'}’s personal data?
                        This removes the member record and replaces their name and student
                        number in local logs with “Purged member”.
                      </Text>
                      <View style={styles.confirmRow}>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                          onPress={() => setConfirmPurgeMember(false)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnAltText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnDanger, styles.modalBtn]}
                          onPress={handlePurgeMember}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnDangerText}>Purge Data</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderOfficeResult = () => {
    if (!lastOffice) {
      return (
        <Card>
          <SectionTitle>Last scan</SectionTitle>
          <Text style={styles.empty}>Tap an ID or search a member to log time in/out.</Text>
        </Card>
      );
    }
    if (!lastOffice.ok) {
      return (
        <Card>
          <SectionTitle>Last scan</SectionTitle>
          <View style={[styles.res, styles.resBad]}>
            <View style={[styles.resTag, styles.resTagBad]}>
              <Text style={styles.resTagText}>NOT LOGGED</Text>
            </View>
            <Text style={styles.resTitle}>Could not log time</Text>
            <Text style={styles.resMeta}>{lastOffice.error}</Text>
          </View>
        </Card>
      );
    }
    const { log, member } = lastOffice;
    return (
      <Card>
        <SectionTitle>Last scan</SectionTitle>
        <View style={styles.res}>
          <View style={styles.resTag}>
            <Text style={styles.resTagText}>
              {log.action === 'office_in' ? 'TIME IN LOGGED' : 'TIME OUT LOGGED'}
            </Text>
          </View>
          <Text style={styles.resTitle}>{log.name}</Text>
          <Text style={styles.resMeta}>
            {log.student_no || '—'} · {(member.status || 'active').toUpperCase()} ·{' '}
            {formatTime(log.time)}
          </Text>
        </View>
      </Card>
    );
  };

  const renderPrintLast = () => {
    if (!lastPrint) {
      return (
        <Card>
          <SectionTitle>Last transaction</SectionTitle>
          <Text style={styles.empty}>No print transaction yet.</Text>
        </Card>
      );
    }
    if (!lastPrint.ok) {
      return (
        <Card>
          <SectionTitle>Last transaction</SectionTitle>
          <View style={[styles.res, styles.resBad]}>
            <View style={[styles.resTag, styles.resTagBad]}>
              <Text style={styles.resTagText}>NOT LOGGED</Text>
            </View>
            <Text style={styles.resTitle}>Could not log print</Text>
            <Text style={styles.resMeta}>{lastPrint.error}</Text>
          </View>
        </Card>
      );
    }
    const { log } = lastPrint;
    const isGuest = log.action === 'print_guest';
    return (
      <Card>
        <SectionTitle>Last transaction</SectionTitle>
        <View style={styles.res}>
          <View style={styles.resTag}>
            <Text style={styles.resTagText}>{isGuest ? 'PAID' : 'DEDUCTED'}</Text>
          </View>
          <Text style={styles.txBig}>
            {isGuest ? '' : '-'}₱{Number(log.amount).toFixed(2)}
          </Text>
          <Text style={styles.resTitle}>{log.name}</Text>
          <View style={styles.txActions}>
            <Text style={styles.resMeta}>
              {isGuest
                ? `No balance · walk-in · ${formatTime(log.time)}`
                : `Balance after ₱${Number(log.balance_after || 0).toFixed(2)} · ${formatTime(
                    log.time
                  )}`}
            </Text>
            <TouchableOpacity
              style={[styles.btnSm, styles.btnSmAlt]}
              onPress={() => handleUndo(log.id)}
              accessibilityRole="button"
            >
              <Text style={styles.btnSmAltText}>Undo tap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  const renderOffice = () => (
    <>
      <Card>
        <SectionTitle>Can’t tap? Look up a member</SectionTitle>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.searchInput]}
            placeholder="Name, student no, or token…"
            placeholderTextColor={C.teal}
            value={officeQuery}
            onChangeText={setOfficeQuery}
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.btnSm}
            onPress={() => {
              if (officeResults[0]) handleOfficePick(officeResults[0], true);
              else showToast('No matching member found.');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.btnSmText}>Go</Text>
          </TouchableOpacity>
        </View>
        {officeQuery.trim() && !officeResults.length ? (
          <Text style={styles.empty}>No member found. Check the ID or spelling.</Text>
        ) : null}
        <MemberResults members={officeResults} onPick={(m) => handleOfficePick(m, true)} />
      </Card>

      <TouchableOpacity
        style={styles.tap}
        activeOpacity={0.85}
        onPress={() => handleScan('office')}
        accessibilityRole="button"
      >
        <View style={styles.tapGlow} />
        <View style={styles.tapRingOuter}>
          <View style={styles.tapRingMid}>
            <View style={styles.tapRingInner}>
              <Text style={styles.tapRingText}>NFC</Text>
            </View>
          </View>
        </View>
        <Text style={styles.tapTitle}>Tap ID for time in / time out</Text>
        <Text style={styles.tapSub}>Hold the card near the back of the phone</Text>
      </TouchableOpacity>

      {renderOfficeResult()}

      <Card>
        <SectionTitle>Recent office logs</SectionTitle>
        {officeLogs.length ? (
          officeLogs.map((log, index) => (
            <View key={log.id} style={[styles.li, index === 0 && styles.liFirst]}>
              <Text style={styles.liTime}>{formatTime(log.time)}</Text>
              <View style={styles.liMid}>
                <Text style={styles.liName} numberOfLines={1}>
                  {log.name}
                </Text>
                <Text style={styles.liNote} numberOfLines={1}>
                  {log.action === 'office_in' ? 'Time in' : 'Time out'}
                  {log.note ? ` · ${log.note}` : ''}
                </Text>
              </View>
              <SyncBadge synced={log.synced} />
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No office logs yet.</Text>
        )}
      </Card>
    </>
  );

  const renderPrinting = () => (
    <>
      <View style={styles.seg}>
        <TouchableOpacity
          style={[styles.segBtn, printMode === 'member' && styles.segOn]}
          onPress={() => setPrintMode('member')}
          accessibilityRole="button"
        >
          <Text style={[styles.segText, printMode === 'member' && styles.segTextOn]}>
            CSSO member
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, printMode === 'guest' && styles.segOn]}
          onPress={() => setPrintMode('guest')}
          accessibilityRole="button"
        >
          <Text style={[styles.segText, printMode === 'guest' && styles.segTextOn]}>
            Non-member
          </Text>
        </TouchableOpacity>
      </View>

      <Card>
        <SectionTitle>
          {printMode === 'member' ? 'Amount to deduct' : 'Amount paid'}
        </SectionTitle>
        <View style={styles.amountField}>
          <Text style={styles.peso}>₱</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={C.teal}
          />
        </View>
        <View style={styles.chipRow}>
          {[5, 10, 20, printMode === 'member' ? 40 : 50].map((value) => (
            <TouchableOpacity
              key={value}
              style={styles.chip}
              onPress={() => handlePreset(value)}
              accessibilityRole="button"
            >
              <Text style={styles.chipText}>+₱{value}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 2 pages, colored"
          placeholderTextColor={C.teal}
          value={note}
          onChangeText={setNote}
        />
      </Card>

      {printMode === 'member' ? (
        <Card>
          <SectionTitle>Identify member</SectionTitle>
          <TouchableOpacity
            style={styles.tap}
            activeOpacity={0.85}
            onPress={() => handleScan('printing')}
            accessibilityRole="button"
          >
            <View style={styles.tapGlow} />
            <View style={styles.tapRingOuter}>
              <View style={styles.tapRingMid}>
                <View style={styles.tapRingInner}>
                  <Text style={styles.tapRingText}>NFC</Text>
                </View>
              </View>
            </View>
            <Text style={styles.tapTitle}>Tap ID to deduct</Text>
            <Text style={styles.tapSub}>Will deduct ₱{amountLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Or look up a member</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Name, student no, or token…"
              placeholderTextColor={C.teal}
              value={printQuery}
              onChangeText={setPrintQuery}
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.btnSm}
              onPress={() => {
                if (printResults[0]) handlePrintPick(printResults[0], true);
                else showToast('No matching member found.');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.btnSmText}>Go</Text>
            </TouchableOpacity>
          </View>
          {printQuery.trim() && !printResults.length ? (
            <Text style={styles.empty}>No member found. Check the ID or spelling.</Text>
          ) : null}
          <MemberResults members={printResults} onPick={(m) => handlePrintPick(m, true)} />
        </Card>
      ) : (
        <Card>
          <SectionTitle>Walk-in details (optional)</SectionTitle>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Anonymous"
            placeholderTextColor={C.teal}
            value={guestName}
            onChangeText={setGuestName}
          />
          <Text style={styles.label}>Student number</Text>
          <TextInput
            style={styles.input}
            placeholder="ANON"
            placeholderTextColor={C.teal}
            value={guestId}
            onChangeText={setGuestId}
            autoCapitalize="characters"
          />
          <View style={styles.note}>
            <Text style={styles.noteText}>
              No ID tap and no balance change for non-members.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, styles.btnBlock, { marginTop: 10 }]}
            onPress={handleGuestPrint}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Log non-member print</Text>
          </TouchableOpacity>
        </Card>
      )}

      {renderPrintLast()}

      <Card>
        <SectionTitle>Recent printing history</SectionTitle>
        {printLogs.length ? (
          printLogs.map((log, index) => {
            const isGuest = log.action === 'print_guest';
            return (
              <View key={log.id} style={[styles.li, index === 0 && styles.liFirst]}>
                <Text style={styles.liTime}>{formatTime(log.time)}</Text>
                <View style={styles.liMid}>
                  <Text style={styles.liName} numberOfLines={1}>
                    {log.name}
                  </Text>
                  <Text style={styles.liNote} numberOfLines={1}>
                    {isGuest
                      ? 'Walk-in · no balance'
                      : `Balance after ₱${Number(log.balance_after || 0).toFixed(2)}`}
                    {log.note ? ` · ${log.note}` : ''}
                  </Text>
                </View>
                <View style={styles.liRight}>
                  <Text style={styles.liAmt}>
                    {isGuest ? '' : '-'}₱{Number(log.amount).toFixed(2)}
                  </Text>
                  <View style={styles.row}>
                    <SyncBadge synced={log.synced} />
                    <TouchableOpacity
                      style={[styles.btnSm, styles.btnSmAlt]}
                      onPress={() => openEdit(log)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSmAltText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.empty}>No printing history yet.</Text>
        )}
      </Card>
    </>
  );

  const handleIssue = () => {
    if (!can(session, 'issue')) {
      showToast('Admin Master Key required to issue stickers.');
      return;
    }
    if (issueMode === 'new' && !issueName.trim()) {
      showToast('Enter the member name first.');
      return;
    }
    if (issueMode !== 'new' && !issueMember) {
      showToast('Select a member first.');
      return;
    }
    showToast('Sticker writing is not connected in this build yet.');
  };

  const issueToken =
    issueMode === 'existing'
      ? issueMember?.token || '<select a member>'
      : '<new token>';

  const renderIssue = () => {
    if (!can(session, 'issue')) {
      return renderUnlockCard(
        'Issue ID is locked',
        'Writing and locking stickers needs the Admin Master Key. Test on spare stickers first.'
      );
    }
    return (
    <>
      <Card>
        <SectionTitle>Issue a sticker</SectionTitle>
        <View style={styles.seg}>
          {[
            ['new', 'New member'],
            ['existing', 'Existing'],
            ['replace', 'Replace lost'],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.segBtn, issueMode === key && styles.segOn]}
              onPress={() => {
                setIssueMode(key);
                setIssueMember(null);
                setIssueQuery('');
              }}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.segText,
                  styles.segTiny,
                  issueMode === key && styles.segTextOn,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {issueMode === 'new' ? (
          <>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="Juan Dela Cruz"
              placeholderTextColor={C.teal}
              value={issueName}
              onChangeText={setIssueName}
            />
            <Text style={styles.label}>Student number</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-0001"
              placeholderTextColor={C.teal}
              value={issueStudentNo}
              onChangeText={setIssueStudentNo}
            />
            <Text style={styles.label}>Role</Text>
            <View style={styles.chipRow}>
              {ROLES.map((roleKey) => (
                <TouchableOpacity
                  key={roleKey}
                  style={[styles.chip, issueRole === roleKey && styles.chipOn]}
                  onPress={() => setIssueRole(roleKey)}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.chipText, issueRole === roleKey && styles.chipOnText]}
                  >
                    {roleLabel(roleKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Valid until (YYYY-MM-DD, optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="2027-06-30"
              placeholderTextColor={C.teal}
              value={issueValidUntil}
              onChangeText={setIssueValidUntil}
              autoCapitalize="none"
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {issueMode === 'replace' ? 'Find the member to re-issue' : 'Find the member'}
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                placeholder="Name, student no, or token…"
                placeholderTextColor={C.teal}
                value={issueQuery}
                onChangeText={setIssueQuery}
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.btnSm}
                onPress={() => {
                  if (issueResults[0]) {
                    setIssueMember(issueResults[0]);
                    setIssueQuery('');
                  } else {
                    showToast('No matching member found.');
                  }
                }}
                accessibilityRole="button"
              >
                <Text style={styles.btnSmText}>Find</Text>
              </TouchableOpacity>
            </View>
            <MemberResults
              members={issueResults}
              onPick={(member) => {
                setIssueMember(member);
                setIssueQuery('');
              }}
              actionLabel="Select"
              showBalance={false}
            />
            {issueMember ? (
              <View style={styles.hit}>
                <View style={styles.hitInfo}>
                  <Text style={styles.hitName}>{issueMember.full_name}</Text>
                  <Text style={styles.hitMeta}>
                    {issueMember.student_no || '—'} · {roleLabel(issueMember.role)} ·{' '}
                    {issueMode === 'replace'
                      ? 'New token will replace the old one on this phone'
                      : `Token ${issueMember.token}`}
                  </Text>
                </View>
              </View>
            ) : null}
            {issueMode === 'replace' ? (
              <View style={styles.note}>
                <Text style={styles.noteText}>
                  The old sticker stops working on this phone. Other phones pick up the new
                  token on their next safe member import.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Link preview</SectionTitle>
        <View style={styles.linkBox}>
          <Text style={styles.linkText} numberOfLines={2}>
            {linkPrefix}{issueToken}
          </Text>
          <Text style={styles.linkNote}>
            The sticker stores only this link. No name, student number, or balance.
          </Text>
        </View>
        <Text style={styles.muted}>
          The link prefix lives in Data settings. Tokens are random and never derived from
          student numbers.
        </Text>
      </Card>

      <Card>
        <SectionTitle>Write & lock</SectionTitle>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Lock sticker after writing</Text>
            <Text style={styles.switchSub}>Locking is permanent. Test on a spare sticker first.</Text>
          </View>
          <Switch
            value={issueLock}
            onValueChange={setIssueLock}
            trackColor={{ false: C.line, true: C.teal }}
            thumbColor={issueLock ? C.mint : '#f4f3f4'}
          />
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.btnBlock, { marginTop: 12 }]}
          onPress={handleIssue}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>
            {issueMode === 'new' ? 'Issue sticker' : 'Write, verify & lock'}
          </Text>
        </TouchableOpacity>
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Sticker writing, verify, and lock are not connected in this UI build yet.
          </Text>
        </View>
      </Card>
    </>
    );
  };

  const renderData = () => (
    <>
      {!can(session, 'settings') && can(session, 'members_tab')
        ? renderUnlockCard(
            'Admin settings locked',
            'Receiver URL, secret, link prefix, and member CSV import need the Admin Master Key.'
          )
        : null}
      {can(session, 'settings') ? (
      <Card>
        <SectionTitle>Officer & sync settings</SectionTitle>
        <Text style={styles.label}>Officer name</Text>
        <TextInput
          style={styles.input}
          value={db.settings.officer || ''}
          onChangeText={(value) => updateSetting('officer', value)}
          placeholder="Officer Juan"
          placeholderTextColor={C.teal}
        />
        <Text style={styles.label}>Receiver URL</Text>
        <TextInput
          style={styles.input}
          value={db.settings.sheet_url || ''}
          onChangeText={(value) => updateSetting('sheet_url', value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          placeholderTextColor={C.teal}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Secret key</Text>
        <TextInput
          style={styles.input}
          value={db.settings.secret || ''}
          onChangeText={(value) => updateSetting('secret', value)}
          placeholder="Shared secret"
          placeholderTextColor={C.teal}
          secureTextEntry
          autoCapitalize="none"
        />
        <Text style={styles.label}>Link prefix</Text>
        <TextInput
          style={styles.input}
          value={db.settings.link_prefix || ''}
          onChangeText={(value) => updateSetting('link_prefix', value)}
          placeholder="https://your-domain/t/"
          placeholderTextColor={C.teal}
          autoCapitalize="none"
        />
        <Text style={styles.muted}>
          Must start with https:// and end with ?t= or /t/.
        </Text>
      </Card>
      ) : null}

      <Card>
        <SectionTitle>Cloud sync</SectionTitle>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{unsyncedCount}</Text>
            <Text style={styles.statLabel}>Waiting to send</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{memberCount}</Text>
            <Text style={styles.statLabel}>Members on phone</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.btnBlock, { marginTop: 10 }]}
          onPress={handleSync}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>Sync now</Text>
        </TouchableOpacity>
        <Text style={styles.muted}>
          Safe to repeat. Records already synced are skipped by the Sheet.
        </Text>
      </Card>

      <Card>
        <SectionTitle>CSV import & export</SectionTitle>
        {can(session, 'import') ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnBlock]}
            onPress={() => notReady('Member CSV import')}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Import members CSV</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.csvRow}>
          {can(session, 'export_new') ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnAlt, styles.csvBtn]}
              onPress={() => notReady('Export new records')}
              accessibilityRole="button"
            >
              <Text style={styles.btnAltText}>Export new records</Text>
            </TouchableOpacity>
          ) : null}
          {can(session, 'export_recent') ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnAlt, styles.csvBtn]}
              onPress={() => notReady('Export recent logs')}
              accessibilityRole="button"
            >
              <Text style={styles.btnAltText}>Export recent logs</Text>
            </TouchableOpacity>
          ) : null}
          {can(session, 'export_members') ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnAlt, styles.csvBtn]}
              onPress={() => notReady('Export members CSV')}
              accessibilityRole="button"
            >
              <Text style={styles.btnAltText}>Export members CSV</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.muted}>
          Safe import keeps each phone’s local balances. Avoid “replace all” on phones that
          are already offline. Encrypts can export new records only.
        </Text>
      </Card>

      <Card>
        <SectionTitle>Heads up</SectionTitle>
        <Text style={styles.muted}>
          Print balances can drift when two phones deduct for the same member while offline.
          Sync often and reconcile from the Sheet.
        </Text>
      </Card>
    </>
  );

  const renderEditModal = () => (
    <Modal
      visible={!!editingLog}
      transparent
      animationType="slide"
      onRequestClose={closeEdit}
    >
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={closeEdit} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 4 }}
            >
              {editingLog ? (
                <>
                  <Text style={styles.sheetTitle}>Edit print log</Text>
                  <Text style={styles.sheetSub}>
                    {editingLog.name} · {formatTime(editingLog.time)} ·{' '}
                    {editingLog.synced ? 'Synced' : 'Unsynced'}
                  </Text>
                  {editingLog.action === 'print_guest' ? (
                    <View style={styles.note}>
                      <Text style={styles.noteText}>
                        Walk-in · no member balance is changed.
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.label}>
                    New amount (previous ₱{Number(editingLog.amount).toFixed(2)})
                  </Text>
                  <View style={styles.amountField}>
                    <Text style={styles.peso}>₱</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={C.teal}
                    />
                  </View>
                  <Text style={styles.label}>Note</Text>
                  <TextInput
                    style={styles.input}
                    value={editNote}
                    onChangeText={setEditNote}
                    placeholder="e.g. 2 pages, colored"
                    placeholderTextColor={C.teal}
                  />
                  {preview ? (
                    <View style={styles.preview}>
                      <Text style={styles.previewLabel}>Balance after</Text>
                      <Text style={styles.previewBig}>
                        ₱{preview.before.toFixed(2)} → ₱{preview.after.toFixed(2)}
                      </Text>
                      <Text style={styles.previewLabel}>{preview.diffLabel}</Text>
                    </View>
                  ) : null}
                  <View style={styles.modalBtns}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                      onPress={closeEdit}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnAltText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.modalBtn]}
                      onPress={handleSaveEdit}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnText}>Save edit</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnDanger, { marginTop: 8 }]}
                    onPress={() => setConfirmVoid(true)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.btnDangerText}>
                      Void / refund full ₱{Number(editingLog.amount).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                  {confirmVoid ? (
                    <View style={styles.confirm}>
                      <Text style={styles.confirmText}>
                        Refund ₱{Number(editingLog.amount).toFixed(2)}? This removes the
                        log from this phone.
                      </Text>
                      <View style={styles.confirmRow}>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnAlt, styles.modalBtn]}
                          onPress={() => setConfirmVoid(false)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnAltText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btn, styles.btnDanger, styles.modalBtn]}
                          onPress={handleVoidRefund}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnDangerText}>Refund</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  if (!session) return renderLogin();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>CS</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>CSSO Officer</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {session.member
              ? `${operatorName} · ${roleLabel(operatorRole)}${
                  isAdminUnlocked ? ' · Admin unlocked' : ''
                }`
              : 'Admin Master Key · Admin'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.pill, isOnline && styles.pillOn]}
            onPress={() =>
              showToast(
                isOnline
                  ? 'Online. Ready to sync.'
                  : 'Working offline. Logs stay on this phone.'
              )
            }
            accessibilityRole="button"
          >
            <View style={styles.dot} />
            <Text style={styles.pillText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.unsynced}>
              <Text style={styles.unsyncedText}>{unsyncedCount} unsynced</Text>
            </View>
            <TouchableOpacity
              style={styles.lockChip}
              onPress={lockApp}
              accessibilityRole="button"
            >
              <Text style={styles.lockChipText}>Lock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.main}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'office' && can(session, 'office') ? renderOffice() : null}
        {activeTab === 'printing' && can(session, 'printing')
          ? renderPrinting()
          : null}
        {activeTab === 'members' && can(session, 'members_tab')
          ? renderMembers()
          : null}
        {activeTab === 'issue' && can(session, 'issue_tab') ? renderIssue() : null}
        {activeTab === 'data' && can(session, 'data') ? renderData() : null}
      </ScrollView>

      {!editingLog ? (
        <View style={styles.nav}>
          {visibleTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.navBtn, activeTab === tab.key && styles.navOn]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <Text
                style={[styles.navIcon, activeTab === tab.key && styles.navIconOn]}
              >
                {tab.icon}
              </Text>
              <Text
                style={[styles.navLabel, activeTab === tab.key && styles.navLabelOn]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {renderEditModal()}
      {renderMemberEditModal()}
      {renderAdminPrompt()}
    </SafeAreaView>
  );
}

