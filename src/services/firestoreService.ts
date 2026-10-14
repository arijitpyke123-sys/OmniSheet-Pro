import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  collection, 
  getDocs, 
  onSnapshot,
  query, 
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SheetCells } from '../utils/formulaEngine';

export interface SpreadsheetMeta {
  id: string;
  title: string;
  ownerId: string;
  ownerName?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  sheetCount?: number;
}

export interface UserPresence {
  userId: string;
  name: string;
  email: string;
  activeCell: string;
  activeSheet: string;
  color: string;
  lastActive: number;
}

const LOCAL_STORAGE_LIST_PREFIX = 'omnisheet_meta_user_';
const LOCAL_STORAGE_KEY_PREFIX = 'omnisheet_doc_';

const COLLABORATOR_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
];

export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}

// 1. LIST SPREADSHEETS FILTERED SPECIFICALLY FOR THIS USER
export async function listSpreadsheets(userId: string): Promise<SpreadsheetMeta[]> {
  if (!userId) return [];
  const userCacheKey = `${LOCAL_STORAGE_LIST_PREFIX}${userId}`;
  const metaList: SpreadsheetMeta[] = [];

  try {
    // Query Firestore specifically for spreadsheets owned by this user
    const q = query(collection(db, 'spreadsheets'), where('ownerId', '==', userId));
    const snap = await getDocs(q);

    snap.forEach((d) => {
      const data = d.data();
      metaList.push({
        id: d.id,
        title: data.title || 'Untitled Spreadsheet',
        ownerId: data.ownerId || userId,
        ownerName: data.ownerName || 'User',
        isPublic: data.isPublic ?? true,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        sheetCount: data.sheetCount || 2,
      });
    });

    // Save this user's specific cache
    try {
      localStorage.setItem(userCacheKey, JSON.stringify(metaList));
    } catch (e) {
      console.warn('Local cache error:', e);
    }

    if (metaList.length > 0) {
      return metaList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  } catch (error) {
    console.warn('Firestore user-specific list error, falling back to user cache:', error);
  }

  // Fallback to user-scoped local storage
  const cached = localStorage.getItem(userCacheKey);
  if (cached) {
    try {
      const parsed: SpreadsheetMeta[] = JSON.parse(cached);
      return parsed.filter(item => item.ownerId === userId);
    } catch {
      return [];
    }
  }

  return [];
}

// 2. CREATE NEW SPREADSHEET FOR SPECIFIC USER
export async function createNewSpreadsheet(
  title: string,
  ownerId: string,
  ownerName: string = 'User',
  initialSheets?: { sheets: Record<string, SheetCells>; sheetNames: string[] }
): Promise<string> {
  const id = 'sheet_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  const defaultSheets = initialSheets?.sheets || {
    Sheet1: {
      'A1': { value: 'Item' },
      'B1': { value: 'Qty' },
      'C1': { value: 'Rate' },
      'D1': { value: 'Total', formula: '=B1*C1' },
      'A2': { value: 'Pro License' },
      'B2': { value: '10' },
      'C2': { value: '99' },
      'D2': { formula: '=B2*C2' },
      'A3': { value: 'Cloud Compute' },
      'B3': { value: '5' },
      'C3': { value: '250' },
      'D3': { formula: '=B3*C3' },
      'A4': { value: 'Total' },
      'D4': { formula: '=SUM(D2:D3)' },
    },
    Sheet2: {}
  };

  const defaultSheetNames = initialSheets?.sheetNames || ['Sheet1', 'Sheet2'];

  const metaData: SpreadsheetMeta = {
    id,
    title,
    ownerId, // Bound specifically to this user
    ownerName,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
    sheetCount: defaultSheetNames.length,
  };

  // Cache locally scoped to this user
  const userCacheKey = `${LOCAL_STORAGE_LIST_PREFIX}${ownerId}`;
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${id}`,
      JSON.stringify({
        ...metaData,
        sheetNames: defaultSheetNames,
        sheets: defaultSheets,
      })
    );

    const existingList = localStorage.getItem(userCacheKey);
    const list: SpreadsheetMeta[] = existingList ? JSON.parse(existingList) : [];
    list.unshift(metaData);
    localStorage.setItem(userCacheKey, JSON.stringify(list));
  } catch (e) {
    console.warn('Local storage error:', e);
  }

  // Persist to Firestore with ownerId
  try {
    await setDoc(doc(db, `spreadsheets/${id}`), metaData);
    await setDoc(doc(db, `spreadsheets/${id}/data/cells`), {
      spreadsheetId: id,
      sheetNames: defaultSheetNames,
      sheets: JSON.stringify(defaultSheets),
      updatedAt: now,
    });
  } catch (err) {
    console.warn('Firestore create spreadsheet warning:', err);
  }

  return id;
}

// 3. DELETE SPREADSHEET (SCOPED TO USER)
export async function deleteSpreadsheet(id: string, userId?: string): Promise<void> {
  // Remove local
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${id}`);
    if (userId) {
      const userCacheKey = `${LOCAL_STORAGE_LIST_PREFIX}${userId}`;
      const existingList = localStorage.getItem(userCacheKey);
      if (existingList) {
        const list: SpreadsheetMeta[] = JSON.parse(existingList);
        const filtered = list.filter((item) => item.id !== id);
        localStorage.setItem(userCacheKey, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.warn('Local delete cache error:', e);
  }

  // Delete from Firestore
  try {
    await deleteDoc(doc(db, `spreadsheets/${id}/data/cells`));
    await deleteDoc(doc(db, `spreadsheets/${id}`));
  } catch (e) {
    console.warn('Firestore delete error:', e);
  }
}

// 4. SAVE SPREADSHEET (Auto-save / concurrent push)
export async function saveSpreadsheetToFirestore(
  spreadsheetId: string,
  title: string,
  ownerId: string,
  sheetNames: string[],
  sheets: Record<string, SheetCells>,
  isPublic: boolean = true
): Promise<void> {
  const now = new Date().toISOString();

  // Cache locally
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${spreadsheetId}`,
      JSON.stringify({
        id: spreadsheetId,
        title,
        ownerId,
        sheetNames,
        sheets,
        isPublic,
        updatedAt: now,
      })
    );
  } catch (e) {
    console.warn('LocalStorage cache warning:', e);
  }

  // Persist to Firestore
  const spreadsheetPath = `spreadsheets/${spreadsheetId}`;
  try {
    await setDoc(doc(db, spreadsheetPath), {
      id: spreadsheetId,
      title,
      ownerId: ownerId || 'user',
      isPublic,
      updatedAt: now,
    }, { merge: true });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, spreadsheetPath);
    } catch (e) {
      console.warn('Firestore write logged:', e);
    }
  }

  const dataPath = `spreadsheets/${spreadsheetId}/data/cells`;
  try {
    await setDoc(doc(db, dataPath), {
      spreadsheetId,
      sheetNames,
      sheets: JSON.stringify(sheets),
      updatedAt: now,
    }, { merge: true });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, dataPath);
    } catch (e) {
      console.warn('Firestore data write logged:', e);
    }
  }
}

// 5. LOAD SPREADSHEET
export async function loadSpreadsheetFromFirestore(
  spreadsheetId: string
): Promise<{ title: string; sheets: Record<string, SheetCells>; sheetNames: string[]; isPublic: boolean } | null> {
  const spreadsheetPath = `spreadsheets/${spreadsheetId}`;
  const dataPath = `spreadsheets/${spreadsheetId}/data/cells`;

  try {
    const sheetDoc = await getDoc(doc(db, spreadsheetPath));
    const dataDoc = await getDoc(doc(db, dataPath));

    if (sheetDoc.exists() && dataDoc.exists()) {
      const sheetData = sheetDoc.data();
      const cellData = dataDoc.data();
      let parsedSheets: Record<string, SheetCells> = {};
      try {
        parsedSheets = JSON.parse(cellData.sheets);
      } catch {
        parsedSheets = {};
      }

      return {
        title: sheetData.title || 'Untitled Spreadsheet',
        isPublic: sheetData.isPublic ?? true,
        sheetNames: cellData.sheetNames || ['Sheet1', 'Sheet2'],
        sheets: parsedSheets,
      };
    }
  } catch (error) {
    console.warn('Could not read from Firestore, checking offline cache:', error);
  }

  // Fallback to local storage
  const local = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${spreadsheetId}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      return {
        title: parsed.title,
        sheetNames: parsed.sheetNames || ['Sheet1', 'Sheet2'],
        sheets: parsed.sheets,
        isPublic: parsed.isPublic ?? true,
      };
    } catch {
      return null;
    }
  }

  return null;
}

// 6. REAL-TIME CONCURRENT SYNC (onSnapshot listener)
export function subscribeToSpreadsheetUpdates(
  spreadsheetId: string,
  onRemoteChange: (data: { sheets: Record<string, SheetCells>; sheetNames: string[]; title?: string }) => void
): () => void {
  const dataPath = `spreadsheets/${spreadsheetId}/data/cells`;

  const unsubscribe = onSnapshot(
    doc(db, dataPath),
    (snapshot) => {
      if (snapshot.exists()) {
        const d = snapshot.data();
        if (d && d.sheets) {
          try {
            const parsedSheets = JSON.parse(d.sheets);
            onRemoteChange({
              sheets: parsedSheets,
              sheetNames: d.sheetNames || ['Sheet1'],
            });
          } catch (e) {
            console.warn('Parse snapshot error:', e);
          }
        }
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, dataPath);
      } catch (err) {
        console.warn('Firestore subscription notice:', err);
      }
    }
  );

  return unsubscribe;
}

// 7. REAL-TIME PRESENCE & CURSOR TRACKING
export async function updateCollaboratorPresence(
  spreadsheetId: string,
  user: { uid: string; displayName?: string; email?: string },
  activeCell: string,
  activeSheet: string
): Promise<void> {
  if (!spreadsheetId || !user?.uid) return;
  const presencePath = `spreadsheets/${spreadsheetId}/presence/${user.uid}`;
  const color = getUserColor(user.uid);

  try {
    await setDoc(doc(db, presencePath), {
      userId: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || 'user@omnisheet.io',
      activeCell,
      activeSheet,
      color,
      lastActive: Date.now(),
    });
  } catch (e) {
    // Non-blocking
  }
}

export function subscribeToCollaboratorPresence(
  spreadsheetId: string,
  currentUserId: string,
  onPresenceUpdate: (collaborators: UserPresence[]) => void
): () => void {
  const presenceCollectionPath = `spreadsheets/${spreadsheetId}/presence`;

  const unsubscribe = onSnapshot(
    collection(db, presenceCollectionPath),
    (snapshot) => {
      const active: UserPresence[] = [];
      const threshold = Date.now() - 60000; // active in last 60 seconds

      snapshot.forEach((d) => {
        const data = d.data() as UserPresence;
        // Don't include self and ignore stale presence
        if (data.userId !== currentUserId && data.lastActive > threshold) {
          active.push(data);
        }
      });

      onPresenceUpdate(active);
    },
    (error) => {
      console.warn('Presence snapshot warning:', error);
    }
  );

  return unsubscribe;
}

export async function removeCollaboratorPresence(
  spreadsheetId: string,
  userId: string
): Promise<void> {
  if (!spreadsheetId || !userId) return;
  try {
    await deleteDoc(doc(db, `spreadsheets/${spreadsheetId}/presence/${userId}`));
  } catch (e) {
    // Ignore cleanup errors
  }
}

// 8. AUDIT LOGS
export async function recordAuditLog(
  spreadsheetId: string,
  userId: string,
  action: string
): Promise<void> {
  const auditPath = `spreadsheets/${spreadsheetId}/auditLogs`;
  try {
    await setDoc(doc(collection(db, auditPath)), {
      spreadsheetId,
      userId,
      action,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write warning:', error);
  }
}
