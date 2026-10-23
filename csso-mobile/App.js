import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  loadDB,
  saveDB,
  deductPrint,
  undoLastPrint,
  editPrintLog,
  voidPrintLog,
  searchMembers,
  formatTime,
} from './src/core';

export default function App() {
  const [activeTab, setActiveTab] = useState('printing');
  const [isOnline, setIsOnline] = useState(false);
  const [db, setDb] = useState(null);

  // Printing state
  const [amount, setAmount] = useState('15.00');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastTx, setLastTx] = useState(null);

  // Edit Modal state
  const [editingLog, setEditingLog] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');

  const lastTapTimeRef = useRef(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable));
    });

    loadDB().then((data) => {
      setDb(data);
    });

    return () => unsubscribe();
  }, []);

  const updateState = async (nextState) => {
    setDb(nextState);
    await saveDB(nextState);
  };

  if (!db) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text style={styles.loadingText}>Loading CSSO Officer…</Text>
      </SafeAreaView>
    );
  }

  const unsyncedCount = db.logs.filter((l) => !l.synced).length;
  const recentPrintLogs = db.logs.filter((l) => l.action === 'print').slice(0, 15);
  const searchResults = searchMembers(db.members, searchQuery);

  const executeDeduction = ({ token, studentNo }) => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 3000) return;
    lastTapTimeRef.current = now;

    const res = deductPrint(db, { token, studentNo, amount, note });
    if (!res.ok) {
      Alert.alert('Deduction Failed', res.error);
      return;
    }

    updateState(res.nextState);
    setLastTx(res.log);
    setNote('');
    setSearchQuery('');
  };

  const handlePreset = (deltaOrValue, isAbsolute = false) => {
    const current = parseFloat(amount) || 0;
    const nextVal = isAbsolute ? deltaOrValue : current + deltaOrValue;
    setAmount(Math.max(0, nextVal).toFixed(2));
  };

  const openEditModal = (log) => {
    setEditingLog(log);
    setEditAmount(log.amount.toFixed(2));
    setEditNote(log.note || '');
  };

  const getBalancePreview = () => {
    if (!editingLog) return null;
    const oldAmt = editingLog.amount;
    const newAmt = parseFloat(editAmount) || 0;
    const diff = Math.round((oldAmt - newAmt) * 100) / 100;
    const currentBal = editingLog.balance_after;
    const previewBal = Math.round((currentBal + diff) * 100) / 100;
    const diffLabel = diff >= 0 ? `(+₱${diff.toFixed(2)})` : `(-₱${Math.abs(diff).toFixed(2)})`;
    return {
      before: `₱${currentBal.toFixed(2)}`,
      after: `₱${previewBal.toFixed(2)}`,
      diffLabel,
    };
  };

  const preview = getBalancePreview();

  const handleSaveEdit = () => {
    if (!editingLog) return;
    const res = editPrintLog(db, {
      logId: editingLog.id,
      newAmount: editAmount,
      newNote: editNote,
    });

    if (!res.ok) {
      Alert.alert('Update Failed', res.error);
      return;
    }

    updateState(res.nextState);
    setEditingLog(null);
  };

  const handleVoidRefund = () => {
    if (!editingLog) return;
    Alert.alert(
      'Confirm Refund',
      `Void this transaction and refund full ₱${editingLog.amount.toFixed(2)} to ${editingLog.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Refund',
          style: 'destructive',
          onPress: () => {
            const res = voidPrintLog(db, editingLog.id);
            if (!res.ok) {
              Alert.alert('Refund Failed', res.error);
              return;
            }
            updateState(res.nextState);
            if (lastTx && lastTx.id === editingLog.id) {
              setLastTx(null);
            }
            setEditingLog(null);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Top App Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CSSO Officer</Text>
        <View style={styles.headerBadges}>
          <View style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
            <Text style={styles.badgeText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          {unsyncedCount > 0 && (
            <View style={[styles.badge, styles.badgePending]}>
              <Text style={styles.badgeTextPending}>{`${unsyncedCount} !`}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Main Tab Content */}
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {activeTab === 'printing' && (
          <View>
            {/* Section 1: Amount to Deduct */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>1. AMOUNT TO DEDUCT (₱)</Text>
              <View style={styles.amountRow}>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencyPrefix}>₱</Text>
                  <TextInput
                    style={styles.amountInput}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                  />
                </View>
                <View style={styles.presetGroup}>
                  <TouchableOpacity style={styles.presetChip} onPress={() => handlePreset(5)}>
                    <Text style={styles.presetText}>+₱5</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.presetChip} onPress={() => handlePreset(10)}>
                    <Text style={styles.presetText}>+₱10</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.presetChip} onPress={() => handlePreset(20)}>
                    <Text style={styles.presetText}>+₱20</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.presetChip, styles.presetMax]} onPress={() => handlePreset(40, true)}>
                    <Text style={[styles.presetText, styles.presetMaxText]}>₱40</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.noteContainer}>
                <Text style={styles.noteLabel}>Note:</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Thesis print (optional)"
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            </View>

            {/* Section 2: Identify Member */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>2. IDENTIFY MEMBER (Tap or Search)</Text>

              {/* NFC Tap Card CTA */}
              <TouchableOpacity
                style={styles.tapCard}
                activeOpacity={0.8}
                onPress={() => {
                  Alert.alert('NFC Scanning Ready', 'Hold member’s card against the phone to deduct.');
                }}
              >
                <Text style={styles.tapCardIcon}>💳</Text>
                <Text style={styles.tapCardTitle}>(( TAP ID TO DEDUCT ))</Text>
                <Text style={styles.tapCardSubtitle}>Target: ₱{amount} deduction</Text>
              </TouchableOpacity>

              {/* Manual Fallback Search */}
              <Text style={styles.fallbackLabel}>Manual Fallback (Name / Stud No):</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 e.g. 2023-12345 or Juan"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {searchResults.length > 0 && (
                <View style={styles.searchResultsBox}>
                  {searchResults.map((m) => (
                    <View key={m.token} style={styles.searchResultRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchMemberName}>{m.full_name}</Text>
                        <Text style={styles.searchMemberDetails}>
                          {m.student_no} • Bal: ₱{(m.print_balance || 0).toFixed(2)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.useButton}
                        onPress={() => executeDeduction({ token: m.token, studentNo: m.student_no })}
                      >
                        <Text style={styles.useButtonText}>Use</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Section 3: Last Transaction */}
            {lastTx && (
              <View style={[styles.card, styles.lastTxCard]}>
                <View style={styles.lastTxHeader}>
                  <Text style={styles.lastTxTitle}>LAST TRANSACTION</Text>
                  <TouchableOpacity
                    style={styles.undoButton}
                    onPress={() => {
                      const res = undoLastPrint(db, lastTx.id);
                      if (res.ok) {
                        updateState(res.nextState);
                        setLastTx(null);
                      }
                    }}
                  >
                    <Text style={styles.undoButtonText}>Undo Tap</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.lastTxRow}>
                  <Text style={styles.lastTxOk}>[OK]</Text>
                  <Text style={styles.lastTxAmount}>-₱{lastTx.amount.toFixed(2)}</Text>
                  <Text style={styles.lastTxDivider}>|</Text>
                  <Text style={styles.lastTxName}>{lastTx.name}</Text>
                </View>
                <Text style={styles.lastTxBalance}>
                  Bal After: ₱{(lastTx.balance_after || 0).toFixed(2)}
                </Text>
              </View>
            )}

            {/* Section 4: Recent Printing History */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>RECENT PRINTING HISTORY</Text>
              {recentPrintLogs.length === 0 ? (
                <Text style={styles.emptyText}>No recent printing transactions.</Text>
              ) : (
                recentPrintLogs.map((log) => (
                  <View key={log.id} style={styles.historyRow}>
                    <View style={styles.historyMain}>
                      <View style={styles.historyTopLine}>
                        <Text style={styles.historyBullet}>•</Text>
                        <Text style={styles.historyTime}>{formatTime(log.time)}</Text>
                        <Text style={styles.historyDivider}>|</Text>
                        <Text style={styles.historyName} numberOfLines={1}>
                          {log.name}
                        </Text>
                        <Text style={styles.historyAmount}>-₱{log.amount.toFixed(2)}</Text>
                      </View>
                      <View style={styles.historySubLine}>
                        <Text style={styles.historyBal}>
                          Bal: ₱{(log.balance_after || 0).toFixed(2)}
                        </Text>
                        <View
                          style={[
                            styles.syncBadge,
                            log.synced ? styles.syncBadgeDone : styles.syncBadgePending,
                          ]}
                        >
                          <Text style={styles.syncBadgeText}>
                            {log.synced ? 'Synced' : 'Unsynced'}
                          </Text>
                        </View>
                        {log.note ? (
                          <Text style={styles.historyNote} numberOfLines={1}>
                            ({log.note})
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditModal(log)}
                    >
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {activeTab === 'office' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>OFFICE LOGS</Text>
            <Text style={styles.emptyText}>Switch to Printing tab to deduct print allowance.</Text>
          </View>
        )}

        {activeTab === 'data' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>DATA & SYNC</Text>
            <Text style={styles.emptyText}>
              {unsyncedCount} unsynced logs ready for Google Sheets upload.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* EDIT / REFUND MODAL VIEW */}
      <Modal
        visible={Boolean(editingLog)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingLog(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>EDIT PRINT LOG</Text>
            <View style={styles.modalDivider} />

            {editingLog && (
              <>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Member:</Text>
                  <Text style={styles.modalVal}>{editingLog.name}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>ID:</Text>
                  <Text style={styles.modalVal}>{editingLog.student_no}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Time:</Text>
                  <Text style={styles.modalVal}>
                    {formatTime(editingLog.time)} ({editingLog.synced ? 'Synced' : 'Unsynced'})
                  </Text>
                </View>

                <View style={[styles.modalInfoRow, { marginTop: 10 }]}>
                  <Text style={styles.modalLabel}>Prev Amount:</Text>
                  <Text style={styles.modalVal}>₱ {editingLog.amount.toFixed(2)}</Text>
                </View>

                <View style={styles.modalInputGroup}>
                  <Text style={styles.modalLabel}>New Amount:</Text>
                  <View style={styles.modalInputWrap}>
                    <Text style={styles.modalInputPrefix}>₱</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      value={editAmount}
                      onChangeText={setEditAmount}
                    />
                  </View>
                </View>

                <View style={styles.modalInputGroup}>
                  <Text style={styles.modalLabel}>Note:</Text>
                  <TextInput
                    style={[styles.modalInput, styles.modalNoteInput]}
                    placeholder="Wrong pages / correction"
                    value={editNote}
                    onChangeText={setEditNote}
                  />
                </View>

                {preview && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewTitle}>Balance Preview:</Text>
                    <Text style={styles.previewNumbers}>
                      {preview.before}  ---&gt;  {preview.after} {preview.diffLabel}
                    </Text>
                  </View>
                )}

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setEditingLog(null)}
                  >
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnSave]}
                    onPress={handleSaveEdit}
                  >
                    <Text style={styles.modalBtnSaveText}>Save Edit</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalDivider} />

                <TouchableOpacity
                  style={styles.voidButton}
                  onPress={handleVoidRefund}
                >
                  <Text style={styles.voidButtonText}>
                    Void / Refund Full ₱{editingLog.amount.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'office' && styles.tabItemActive]}
          onPress={() => setActiveTab('office')}
        >
          <Text style={[styles.tabLabel, activeTab === 'office' && styles.tabLabelActive]}>
            Office
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'printing' && styles.tabItemActive]}
          onPress={() => setActiveTab('printing')}
        >
          <Text style={[styles.tabLabel, activeTab === 'printing' && styles.tabLabelActive]}>
            PRINTING
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'data' && styles.tabItemActive]}
          onPress={() => setActiveTab('data')}
        >
          <Text style={[styles.tabLabel, activeTab === 'data' && styles.tabLabelActive]}>
            Data
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  headerBadges: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeOnline: { backgroundColor: '#dcfce7' },
  badgeOffline: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  badgePending: { backgroundColor: '#fed7aa' },
  badgeTextPending: { fontSize: 12, fontWeight: '700', color: '#9a3412' },
  content: { flex: 1, padding: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', letterSpacing: 0.5, marginBottom: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  amountInputContainer: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
    height: 44,
  },
  currencyPrefix: { fontSize: 18, fontWeight: '700', color: '#334155', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0f172a' },
  presetGroup: { flex: 2, flexDirection: 'row', gap: 4 },
  presetChip: {
    flex: 1,
    height: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetText: { fontSize: 12, fontWeight: '600', color: '#1e293b' },
  presetMax: { backgroundColor: '#e0e7ff', borderColor: '#c7d2fe' },
  presetMaxText: { color: '#3730a3' },
  noteContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  noteInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#f8fafc',
  },
  tapCard: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  tapCardIcon: { fontSize: 24, marginBottom: 4 },
  tapCardTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  tapCardSubtitle: { color: '#bfdbfe', fontSize: 12, marginTop: 2 },
  fallbackLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    fontSize: 14,
  },
  searchResultsBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchMemberName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  searchMemberDetails: { fontSize: 12, color: '#64748b', marginTop: 2 },
  useButton: { backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  useButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  lastTxCard: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1 },
  lastTxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lastTxTitle: { fontSize: 12, fontWeight: '700', color: '#166534' },
  undoButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#fee2e2' },
  undoButtonText: { fontSize: 11, fontWeight: '700', color: '#991b1b' },
  lastTxRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastTxOk: { color: '#16a34a', fontWeight: '800', fontSize: 13 },
  lastTxAmount: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
  lastTxDivider: { color: '#cbd5e1' },
  lastTxName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  lastTxBalance: { fontSize: 12, color: '#4b5563', marginTop: 4 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyMain: { flex: 1 },
  historyTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyBullet: { color: '#64748b' },
  historyTime: { fontSize: 12, color: '#475569' },
  historyDivider: { color: '#cbd5e1' },
  historyName: { fontSize: 13, fontWeight: '600', color: '#0f172a', maxWidth: 120 },
  historyAmount: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  historySubLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, paddingLeft: 10 },
  historyBal: { fontSize: 11, color: '#64748b' },
  syncBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  syncBadgeDone: { backgroundColor: '#dcfce7' },
  syncBadgePending: { backgroundColor: '#fed7aa' },
  syncBadgeText: { fontSize: 10, fontWeight: '600', color: '#334155' },
  historyNote: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: '#2563eb' },
  emptyText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  modalDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  modalInfoRow: { flexDirection: 'row', marginBottom: 6 },
  modalLabel: { width: 95, fontSize: 13, color: '#64748b', fontWeight: '600' },
  modalVal: { flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600' },
  modalInputGroup: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  modalInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 38,
  },
  modalInputPrefix: { fontSize: 14, fontWeight: '700', color: '#64748b', marginRight: 4 },
  modalInput: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a' },
  modalNoteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 38,
    fontSize: 13,
  },
  previewBox: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 12,
  },
  previewTitle: { fontSize: 12, fontWeight: '700', color: '#1e40af', marginBottom: 4 },
  previewNumbers: { fontSize: 13, fontWeight: '700', color: '#1e3a8a' },
  modalActionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  modalBtnCancelText: { color: '#475569', fontWeight: '600' },
  modalBtnSave: { backgroundColor: '#2563eb' },
  modalBtnSaveText: { color: '#ffffff', fontWeight: '700' },
  voidButton: { paddingVertical: 10, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center' },
  voidButtonText: { color: '#b91c1c', fontSize: 13, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    height: 54,
  },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabItemActive: { borderTopWidth: 2, borderTopColor: '#2563eb' },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabLabelActive: { color: '#2563eb', fontWeight: '800' },
});