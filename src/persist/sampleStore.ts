const DB = "horikore";
const STORE = "samples";
const KEY = "instrument";
/** v2: 誤爆していた旧楽器サンプルを捨てる。録り直せばまた保存される。 */
const VERSION = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (event.oldVersion < 2) req.transaction?.objectStore(STORE).delete(KEY);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSpectrum(bins: Float32Array): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(Array.from(bins), KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSpectrum(): Promise<Float32Array | null> {
  const db = await open();
  const bins = await new Promise<number[] | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as number[] | undefined);
    req.onerror = () => reject(tx.error);
  });
  db.close();
  return bins ? Float32Array.from(bins) : null;
}

export async function clearSpectrum(): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
