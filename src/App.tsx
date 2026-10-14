import React, { useState, useEffect, useRef } from 'react';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Navbar } from './components/Navbar';
import { Toolbar } from './components/Toolbar';
import { FormulaBar } from './components/FormulaBar';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import { ChartModal } from './components/ChartModal';
import { ShareModal } from './components/ShareModal';
import { PluginModal } from './components/PluginModal';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { PlanQuotaModal } from './components/PlanQuotaModal';
import { RenderDeployModal } from './components/RenderDeployModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { 
  SheetCells, 
  getCellsInRange, 
  parseCellCoord, 
  cellCoordToString 
} from './utils/formulaEngine';
import { 
  tenantRateLimiter, 
  TENANT_PLANS, 
  QuotaStatus 
} from './utils/rateLimiter';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  RotateCcw, 
  TrendingUp, 
  X 
} from 'lucide-react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  saveSpreadsheetToFirestore, 
  loadSpreadsheetFromFirestore, 
  recordAuditLog,
  subscribeToSpreadsheetUpdates,
  subscribeToCollaboratorPresence,
  updateCollaboratorPresence,
  removeCollaboratorPresence,
  UserPresence
} from './services/firestoreService';
import Papa from 'papaparse';

export default function App() {
  const [user, setUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('omnisheet_active_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authChecking, setAuthChecking] = useState(true);

  // Theme state: dark / light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('omnisheet_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('omnisheet_theme', next);
      } catch {}
      return next;
    });
  };

  // activeSpreadsheetId: null means the user is on the Sheets Dashboard!
  const [activeSpreadsheetId, setActiveSpreadsheetId] = useState<string | null>(null);

  const [title, setTitle] = useState('Untitled Spreadsheet');
  const [activeRole, setActiveRole] = useState<'owner' | 'editor' | 'viewer'>('owner');

  const [sheets, setSheets] = useState<string[]>(['Sheet1', 'Sheet2']);
  const [activeSheet, setActiveSheet] = useState<string>('Sheet1');
  
  // Sheet data storage per sheet name
  const [allSheetCells, setAllSheetCells] = useState<Record<string, SheetCells>>({
    Sheet1: {},
    Sheet2: {},
  });

  // Single cell vs Multi-cell range selection
  const [selectedCell, setSelectedCell] = useState('A1');
  const [selectionRange, setSelectionRange] = useState<{ start: string; end: string } | null>(null);
  const [formulaValue, setFormulaValue] = useState('');
  const [rowCount, setRowCount] = useState(50);
  const [colCount, setColCount] = useState(20);

  // Firestore Sync & Real-time Concurrent Collaboration State
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [collaboratorsPresence, setCollaboratorsPresence] = useState<UserPresence[]>([]);
  const saveTimeoutRef = useRef<any>(null);
  const isLocalMutationRef = useRef(false);

  // Modals state
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPluginsOpen, setIsPluginsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPlanQuotaOpen, setIsPlanQuotaOpen] = useState(false);
  const [isRenderDeployOpen, setIsRenderDeployOpen] = useState(false);

  // Tenant Plan & Rate Limiting state (Netflix-style rolling quota)
  const [tenantPlanId, setTenantPlanId] = useState<string>(() => {
    try {
      return localStorage.getItem('omnisheet_tenant_plan_' + (user?.uid || 'guest')) || 'basic_50';
    } catch {
      return 'basic_50';
    }
  });
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>(() => 
    tenantRateLimiter.getQuotaStatus(user?.uid || 'guest', tenantPlanId)
  );
  const [quotaAlertMessage, setQuotaAlertMessage] = useState<string | null>(null);
  const [planUpgradeToast, setPlanUpgradeToast] = useState<string | null>(null);

  // Sync tenant plan when user logs in
  useEffect(() => {
    if (user?.uid) {
      const savedPlan = localStorage.getItem('omnisheet_tenant_plan_' + user.uid) || 'basic_50';
      setTenantPlanId(savedPlan);
      setQuotaStatus(tenantRateLimiter.getQuotaStatus(user.uid, savedPlan));
    }
  }, [user]);

  // Periodic refresh of quota status (sliding window token replenishment)
  useEffect(() => {
    const currentTenant = user?.uid || 'guest';
    const interval = setInterval(() => {
      setQuotaStatus(tenantRateLimiter.getQuotaStatus(currentTenant, tenantPlanId));
    }, 8000);
    return () => clearInterval(interval);
  }, [user, tenantPlanId]);

  const handleSelectPlan = (newPlanId: string) => {
    const currentTenant = user?.uid || 'guest';
    setTenantPlanId(newPlanId);
    try {
      localStorage.setItem('omnisheet_tenant_plan_' + currentTenant, newPlanId);
    } catch {}
    const newStatus = tenantRateLimiter.getQuotaStatus(currentTenant, newPlanId);
    setQuotaStatus(newStatus);
    setQuotaAlertMessage(null);
    const plan = TENANT_PLANS[newPlanId] || TENANT_PLANS.basic_50;
    setPlanUpgradeToast(`Tenant plan changed to ${plan.name} (₹${plan.priceRupees}/mo)! Your quota is now ${plan.hourlyQuota.toLocaleString()} changes/hr.`);
    setTimeout(() => setPlanUpgradeToast(null), 5000);
  };

  const handleResetQuotaDemo = () => {
    const currentTenant = user?.uid || 'guest';
    tenantRateLimiter.resetQuota(currentTenant);
    setQuotaStatus(tenantRateLimiter.getQuotaStatus(currentTenant, tenantPlanId));
    setQuotaAlertMessage(null);
  };

  const handleSimulateLimitDemo = () => {
    const currentTenant = user?.uid || 'guest';
    const plan = TENANT_PLANS[tenantPlanId] || TENANT_PLANS.basic_50;
    tenantRateLimiter.simulateUsage(currentTenant, plan.hourlyQuota);
    const status = tenantRateLimiter.getQuotaStatus(currentTenant, tenantPlanId);
    setQuotaStatus(status);
    setQuotaAlertMessage(status.error || `Rate limit reached: ${plan.hourlyQuota}/${plan.hourlyQuota} changes used.`);
  };

  // Collaborators & Audit logs
  const [collaborators, setCollaborators] = useState<Array<{ email: string; role: 'owner' | 'editor' | 'commenter' | 'viewer' }>>([
    { email: 'arijitpyke123@gmail.com', role: 'owner' },
  ]);
  const [isPublic, setIsPublic] = useState(true);
  const [auditLogs, setAuditLogs] = useState<Array<{ action: string; timestamp: string; userId: string }>>([]);

  // Compute selected target cells
  const getSelectedTargetCells = (): string[] => {
    if (selectionRange) {
      return getCellsInRange(selectionRange.start, selectionRange.end);
    }
    return [selectedCell];
  };

  const selectedTargetCells = getSelectedTargetCells();
  const selectionLabel = selectionRange && selectionRange.start !== selectionRange.end
    ? `${selectionRange.start}:${selectionRange.end}`
    : selectedCell;

  // 1. Auth observer on boot
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      if (auth) {
        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          if (currentUser) {
            setUser(currentUser);
            try {
              localStorage.setItem('omnisheet_active_user', JSON.stringify({
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
              }));
            } catch {}
            if (currentUser.email) {
              setCollaborators(prev => {
                if (!prev.some(c => c.email === currentUser.email)) {
                  return [...prev, { email: currentUser.email!, role: 'owner' }];
                }
                return prev;
              });
            }
          }
          setAuthChecking(false);
        });
      } else {
        setAuthChecking(false);
      }
    } catch {
      setAuthChecking(false);
    }
    return () => unsubscribe();
  }, []);

  // 2. Load active spreadsheet and subscribe to concurrent updates
  useEffect(() => {
    if (!user || !activeSpreadsheetId) return;

    // Load initial state
    const loadData = async () => {
      try {
        const loaded = await loadSpreadsheetFromFirestore(activeSpreadsheetId);
        if (loaded) {
          if (loaded.title) setTitle(loaded.title);
          if (loaded.sheets && Object.keys(loaded.sheets).length > 0) {
            setAllSheetCells(loaded.sheets);
          }
          if (loaded.sheetNames && loaded.sheetNames.length > 0) {
            setSheets(loaded.sheetNames);
            if (!loaded.sheetNames.includes(activeSheet)) {
              setActiveSheet(loaded.sheetNames[0]);
            }
          }
          if (loaded.isPublic !== undefined) setIsPublic(loaded.isPublic);
          setLastSavedAt(new Date().toLocaleTimeString());
        }
      } catch (err) {
        console.warn('Initial load from Firestore note:', err);
      }
    };
    loadData();

    // Subscribe to live concurrent spreadsheet updates from other collaborators
    const unsubscribeSpreadsheet = subscribeToSpreadsheetUpdates(
      activeSpreadsheetId,
      (remoteData) => {
        if (!isLocalMutationRef.current) {
          setAllSheetCells(remoteData.sheets);
          if (remoteData.sheetNames && remoteData.sheetNames.length > 0) {
            setSheets(remoteData.sheetNames);
          }
          setLastSavedAt(new Date().toLocaleTimeString());
        }
      }
    );

    // Subscribe to live collaborator presence (cursors)
    const unsubscribePresence = subscribeToCollaboratorPresence(
      activeSpreadsheetId,
      user.uid,
      (activePresence) => {
        setCollaboratorsPresence(activePresence);
      }
    );

    // Initial presence ping
    updateCollaboratorPresence(activeSpreadsheetId, user, selectedCell, activeSheet);

    // Periodic presence heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      updateCollaboratorPresence(activeSpreadsheetId, user, selectedCell, activeSheet);
    }, 15000);

    return () => {
      unsubscribeSpreadsheet();
      unsubscribePresence();
      clearInterval(heartbeat);
      removeCollaboratorPresence(activeSpreadsheetId, user.uid);
    };
  }, [user, activeSpreadsheetId]);

  // 3. Update presence whenever user switches selected cell or active sheet
  useEffect(() => {
    if (user && activeSpreadsheetId) {
      updateCollaboratorPresence(activeSpreadsheetId, user, selectedCell, activeSheet);
    }
  }, [selectedCell, activeSheet, user, activeSpreadsheetId]);

  // 4. Trigger debounced Firestore save
  const triggerFirestoreSave = (
    newTitle = title,
    newSheets = allSheetCells,
    sheetList = sheets
  ) => {
    if (!user || !activeSpreadsheetId) return;
    setIsSaving(true);
    isLocalMutationRef.current = true;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveSpreadsheetToFirestore(
          activeSpreadsheetId,
          newTitle,
          user.uid,
          sheetList,
          newSheets,
          isPublic
        );
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (err) {
        console.warn('Auto-save to Firestore caught:', err);
      } finally {
        setIsSaving(false);
        setTimeout(() => {
          isLocalMutationRef.current = false;
        }, 300);
      }
    }, 800);
  };

  const handleManualSave = async () => {
    if (!user || !activeSpreadsheetId) return;
    setIsSaving(true);
    try {
      await saveSpreadsheetToFirestore(
        activeSpreadsheetId,
        title,
        user.uid,
        sheets,
        allSheetCells,
        isPublic
      );
      setLastSavedAt(new Date().toLocaleTimeString());
      recordAuditLog(activeSpreadsheetId, user.email || user.uid, 'Manual sync to Firestore');
    } catch (err) {
      console.warn('Manual save warning:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentCells = allSheetCells[activeSheet] || {};

  const handleCellChange = (cellKey: string, value: string, formula?: string) => {
    const currentTenant = user?.uid || 'guest';
    const newQuota = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, 1);
    setQuotaStatus(newQuota);

    if (!newQuota.allowed) {
      setQuotaAlertMessage(newQuota.error || 'Write rate limit reached. Upgrade your subscription plan or wait for the hourly reset.');
      return;
    }

    const updated = {
      ...allSheetCells,
      [activeSheet]: {
        ...allSheetCells[activeSheet],
        [cellKey]: {
          ...allSheetCells[activeSheet]?.[cellKey],
          value: formula ? '' : value,
          formula: formula,
        }
      }
    };

    setAllSheetCells(updated);
    triggerFirestoreSave(title, updated, sheets);

    const logEntry = {
      action: `Updated cell ${cellKey} in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      updateCollaboratorPresence(activeSpreadsheetId, user, cellKey, activeSheet);
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleCommitFormula = () => {
    if (formulaValue.startsWith('=')) {
      handleCellChange(selectedCell, '', formulaValue);
    } else {
      handleCellChange(selectedCell, formulaValue);
    }
  };

  // 5. Operations on Selected Cells (Multi-Cell batch formatting & clearing)
  const handleFormat = (styleKey: string, val: any) => {
    const targets = getSelectedTargetCells();
    const currentTenant = user?.uid || 'guest';
    const newQuota = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, targets.length);
    setQuotaStatus(newQuota);

    if (!newQuota.allowed) {
      setQuotaAlertMessage(newQuota.error || 'Batch formatting exceeds your tenant quota limit.');
      return;
    }

    const updatedCurrentSheet = { ...allSheetCells[activeSheet] };

    for (const key of targets) {
      const cell = updatedCurrentSheet[key] || { value: '' };
      updatedCurrentSheet[key] = {
        ...cell,
        [styleKey]: val,
      };
    }

    const updated = {
      ...allSheetCells,
      [activeSheet]: updatedCurrentSheet
    };
    setAllSheetCells(updated);
    triggerFirestoreSave(title, updated, sheets);
  };

  const handleClearSelected = () => {
    const targets = getSelectedTargetCells();
    const currentTenant = user?.uid || 'guest';
    const newQuota = tenantRateLimiter.consumeQuota(currentTenant, tenantPlanId, targets.length);
    setQuotaStatus(newQuota);

    if (!newQuota.allowed) {
      setQuotaAlertMessage(newQuota.error || 'Batch clear exceeds your tenant quota limit.');
      return;
    }

    const updatedCurrentSheet = { ...allSheetCells[activeSheet] };

    for (const key of targets) {
      delete updatedCurrentSheet[key];
    }

    const updated = {
      ...allSheetCells,
      [activeSheet]: updatedCurrentSheet
    };
    setAllSheetCells(updated);
    triggerFirestoreSave(title, updated, sheets);

    const logEntry = {
      action: `Cleared ${targets.length} cells in ${activeSheet}`,
      timestamp: new Date().toISOString(),
      userId: user?.email || 'User'
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    if (activeSpreadsheetId) {
      recordAuditLog(activeSpreadsheetId, user?.email || 'User', logEntry.action);
    }
  };

  const handleAutoSumSelected = () => {
    const targets = getSelectedTargetCells();
    if (targets.length <= 1) return;

    const coords = targets.map(t => parseCellCoord(t)!).filter(Boolean);
    const maxRow = Math.max(...coords.map(c => c.row));
    const minRow = Math.min(...coords.map(c => c.row));
    const minCol = Math.min(...coords.map(c => c.col));
    const maxCol = Math.max(...coords.map(c => c.col));

    const targetRow = maxRow + 1;
    const targetCellKey = cellCoordToString(minCol, targetRow);
    const startCellKey = cellCoordToString(minCol, minRow);
    const endCellKey = cellCoordToString(maxCol, maxRow);

    const sumFormula = `=SUM(${startCellKey}:${endCellKey})`;
    handleCellChange(targetCellKey, '', sumFormula);
    setSelectedCell(targetCellKey);
    setSelectionRange({ start: targetCellKey, end: targetCellKey });
  };

  // Keyboard Delete / Backspace shortcut to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleClearSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionRange, selectedCell, allSheetCells, activeSheet, user, activeSpreadsheetId]);

  const handleInsertFormula = (formulaTemp: string) => {
    setFormulaValue(formulaTemp);
    handleCellChange(selectedCell, '', formulaTemp);
  };

  const handleAddSheet = () => {
    const newName = `Sheet${sheets.length + 1}`;
    const newSheetList = [...sheets, newName];
    const updated = { ...allSheetCells, [newName]: {} };
    setSheets(newSheetList);
    setAllSheetCells(updated);
    setActiveSheet(newName);
    triggerFirestoreSave(title, updated, newSheetList);
  };

  const handleExportCSV = () => {
    const rows: string[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const rowData: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const colLetter = String.fromCharCode(65 + c);
        const cell = currentCells[`${colLetter}${r}`];
        rowData.push(cell?.formula || cell?.value || '');
      }
      rows.push(rowData);
    }
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_${activeSheet}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      complete: (results) => {
        const newCells: SheetCells = {};
        results.data.forEach((row: any, rIndex: number) => {
          row.forEach((val: any, cIndex: number) => {
            if (cIndex < 26) {
              const colLetter = String.fromCharCode(65 + cIndex);
              const cellKey = `${colLetter}${rIndex + 1}`;
              if (val) {
                newCells[cellKey] = { value: String(val) };
              }
            }
          });
        });
        const updated = { ...allSheetCells, [activeSheet]: newCells };
        setAllSheetCells(updated);
        triggerFirestoreSave(title, updated, sheets);
      }
    });
  };

  const handleRunScript = (scriptStr: string) => {
    try {
      const cells = currentCells;
      const updateCell = (key: string, val: string) => {
        handleCellChange(key, val);
      };
      // eslint-disable-next-line no-new-func
      const fn = new Function('cells', 'updateCell', scriptStr);
      fn(cells, updateCell);
    } catch (err) {
      console.error("Macro execution error:", err);
    }
  };

  // If still checking initial auth state, show minimal loader
  if (authChecking) {
    return (
      <div className={`flex h-screen w-screen items-center justify-center ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-slate-400 font-medium">Initializing OmniSheet Pro...</p>
        </div>
      </div>
    );
  }

  const handleLoginSuccess = (authenticatedUser: any) => {
    setUser(authenticatedUser);
    try {
      localStorage.setItem('omnisheet_active_user', JSON.stringify({
        uid: authenticatedUser.uid,
        email: authenticatedUser.email,
        displayName: authenticatedUser.displayName,
        photoURL: authenticatedUser.photoURL,
      }));
    } catch {}
    if (authenticatedUser.email) {
      setCollaborators(prev => {
        if (!prev.some(c => c.email === authenticatedUser.email)) {
          return [...prev, { email: authenticatedUser.email!, role: 'owner' }];
        }
        return prev;
      });
    }
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('omnisheet_active_user');
      if (auth) {
        await signOut(auth);
      }
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    setUser(null);
    setActiveSpreadsheetId(null);
  };

  // 1. AUTHENTICATION PAGE BEFORE APPLICATION OPENS
  if (!user) {
    return (
      <AuthPage 
        onLoginSuccess={handleLoginSuccess} 
      />
    );
  }

  // 2. SPREADSHEETS DASHBOARD LANDING PAGE (Multiple sheets available to user)
  if (!activeSpreadsheetId) {
    return (
      <>
        <Dashboard
          user={user}
          onOpenSpreadsheet={(sheetId) => {
            setActiveSpreadsheetId(sheetId);
          }}
          onSignOut={handleSignOut}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenPlanQuota={() => setIsPlanQuotaOpen(true)}
          quotaStatus={quotaStatus}
          onOpenRenderDeploy={() => setIsRenderDeployOpen(true)}
        />

        {/* Plan & Quota Modal accessible from Dashboard */}
        <PlanQuotaModal
          isOpen={isPlanQuotaOpen}
          onClose={() => setIsPlanQuotaOpen(false)}
          currentPlanId={tenantPlanId}
          onSelectPlan={handleSelectPlan}
          quotaStatus={quotaStatus}
          onResetQuotaDemo={handleResetQuotaDemo}
          onSimulateLimitDemo={handleSimulateLimitDemo}
          theme={theme}
        />

        {/* Render Deployment Modal */}
        <RenderDeployModal
          isOpen={isRenderDeployOpen}
          onClose={() => setIsRenderDeployOpen(false)}
          theme={theme}
        />

        {/* Upgrade Toast Notification */}
        {planUpgradeToast && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
            <span>{planUpgradeToast}</span>
            <button onClick={() => setPlanUpgradeToast(null)} className="ml-2 hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </>
    );
  }

  // 3. MAIN SPREADSHEET WORKSPACE (With multi-cell selection & concurrent editing)
  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden font-sans antialiased transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      <Navbar
        title={title}
        setTitle={(newTitle) => {
          setTitle(newTitle);
          triggerFirestoreSave(newTitle, allSheetCells, sheets);
        }}
        onBackToDashboard={() => {
          setActiveSpreadsheetId(null);
        }}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenCharts={() => setIsChartsOpen(true)}
        onOpenPlugins={() => setIsPluginsOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onExportCSV={handleExportCSV}
        onImportCSV={handleImportCSV}
        user={user}
        setUser={setUser}
        activeRole={activeRole}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
        onManualSave={handleManualSave}
        collaboratorsPresence={collaboratorsPresence}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenPlanQuota={() => setIsPlanQuotaOpen(true)}
        quotaStatus={quotaStatus}
        onOpenRenderDeploy={() => setIsRenderDeployOpen(true)}
      />

      <Toolbar
        onFormat={handleFormat}
        onInsertFormula={handleInsertFormula}
        onAddRow={() => setRowCount(prev => prev + 10)}
        onAddCol={() => setColCount(prev => prev + 5)}
        onClearSelected={handleClearSelected}
        onAutoSumSelected={handleAutoSumSelected}
        selectedCellsCount={selectedTargetCells.length}
        selectionLabel={selectionLabel}
        theme={theme}
      />

      <FormulaBar
        selectedCell={selectedCell}
        selectionLabel={selectionLabel}
        formulaValue={formulaValue}
        setFormulaValue={setFormulaValue}
        onCommitFormula={handleCommitFormula}
        theme={theme}
      />

      <SpreadsheetGrid
        cells={currentCells}
        onCellChange={handleCellChange}
        selectedCell={selectedCell}
        setSelectedCell={(cell) => {
          setSelectedCell(cell);
          setSelectionRange(null);
        }}
        selectionRange={selectionRange}
        setSelectionRange={setSelectionRange}
        formulaValue={formulaValue}
        setFormulaValue={setFormulaValue}
        rowCount={rowCount}
        colCount={colCount}
        sheets={sheets}
        activeSheet={activeSheet}
        setActiveSheet={setActiveSheet}
        onAddSheet={handleAddSheet}
        collaboratorCursors={collaboratorsPresence
          .filter(c => c.activeSheet === activeSheet)
          .map(c => ({
            userId: c.userId,
            name: c.name,
            cell: c.activeCell,
            color: c.color
          }))}
        theme={theme}
      />

      {/* Floating Rate Limit Exceeded Alert Banner */}
      {quotaAlertMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-2xl border border-red-500/50 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md text-slate-100 ring-1 ring-red-500/30 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
              <Zap className="h-5 w-5 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">
                  Rate Limit Exceeded (Netflix-Style)
                </h4>
                <button 
                  onClick={() => setQuotaAlertMessage(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                {quotaAlertMessage}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsPlanQuotaOpen(true)}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:from-emerald-500 hover:to-teal-400 transition"
                >
                  Upgrade Plan (₹199 / ₹499)
                </button>
                <button
                  onClick={handleResetQuotaDemo}
                  className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
                  title="Reset usage counter for demo testing"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Quota
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Upgrade Toast */}
      {planUpgradeToast && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
          <span>{planUpgradeToast}</span>
          <button onClick={() => setPlanUpgradeToast(null)} className="ml-2 hover:opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Modals */}
      <PlanQuotaModal
        isOpen={isPlanQuotaOpen}
        onClose={() => setIsPlanQuotaOpen(false)}
        currentPlanId={tenantPlanId}
        onSelectPlan={handleSelectPlan}
        quotaStatus={quotaStatus}
        onResetQuotaDemo={handleResetQuotaDemo}
        onSimulateLimitDemo={handleSimulateLimitDemo}
        theme={theme}
      />

      <RenderDeployModal
        isOpen={isRenderDeployOpen}
        onClose={() => setIsRenderDeployOpen(false)}
        theme={theme}
      />

      <ChartModal
        isOpen={isChartsOpen}
        onClose={() => setIsChartsOpen(false)}
        cells={currentCells}
        theme={theme}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        collaborators={collaborators}
        onAddCollaborator={(email, role) => setCollaborators(prev => [...prev, { email, role }])}
        isPublic={isPublic}
        setIsPublic={(val) => {
          setIsPublic(val);
          triggerFirestoreSave(title, allSheetCells, sheets);
        }}
        theme={theme}
      />

      <PluginModal
        isOpen={isPluginsOpen}
        onClose={() => setIsPluginsOpen(false)}
        onRunScript={handleRunScript}
        theme={theme}
      />

      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        logs={auditLogs}
        theme={theme}
      />

      <OfflineIndicator />
    </div>
  );
}
