import { TranscriptEntry } from '../types';

const DB_NAME = 'captains_log_db';
const DB_VERSION = 1;
const STORE_CHUNKS = 'chunks';
const STORE_META = 'metadata';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        db.createObjectStore(STORE_CHUNKS, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
  });
};

export const saveChunk = async (chunk: Blob) => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readwrite');
      const store = tx.objectStore(STORE_CHUNKS);
      store.add(chunk);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Auto-save chunk error:", e);
  }
};

export const saveTranscriptDraft = async (transcript: TranscriptEntry[]) => {
  try {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);
      store.put(transcript, 'transcript');
      store.put(Date.now(), 'lastUpdated');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Auto-save transcript error:", e);
  }
};

export const checkDraftExists = async (): Promise<boolean> => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_CHUNKS, 'readonly');
            const store = tx.objectStore(STORE_CHUNKS);
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                resolve(countRequest.result > 0);
            }
            countRequest.onerror = () => resolve(false);
        });
    } catch {
        return false;
    }
}

export const loadDraft = async (): Promise<{ blob: Blob; transcript: TranscriptEntry[] } | null> => {
  try {
    const db = await initDB();
    
    // Get Chunks
    const chunks = await new Promise<Blob[]>((resolve, reject) => {
       const tx = db.transaction(STORE_CHUNKS, 'readonly');
       const store = tx.objectStore(STORE_CHUNKS);
       const request = store.getAll();
       request.onsuccess = () => resolve(request.result);
       request.onerror = () => reject(request.error);
    });

    if (chunks.length === 0) return null;

    // Get Transcript
    const transcript = await new Promise<TranscriptEntry[]>((resolve) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const store = tx.objectStore(STORE_META);
        const request = store.get('transcript');
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
    });

    return {
        blob: new Blob(chunks, { type: 'video/mp4' }),
        transcript
    };
  } catch (e) {
      console.error("Load draft error:", e);
      return null;
  }
};

export const clearDraft = async () => {
    try {
        const db = await initDB();
        const tx = db.transaction([STORE_CHUNKS, STORE_META], 'readwrite');
        tx.objectStore(STORE_CHUNKS).clear();
        tx.objectStore(STORE_META).clear();
        return new Promise<void>((resolve) => {
            tx.oncomplete = () => resolve();
        });
    } catch (e) {
        console.error("Clear draft error:", e);
    }
}
