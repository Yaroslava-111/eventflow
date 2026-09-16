/* =============================================
   EventFlow — db.js
   IndexedDB: открытие, схема, миграции, операции
   ============================================= */

const DB_NAME = 'eventflow-db';
const DB_VERSION = 1;

let dbInstance = null;

function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('participants')) {
        const participantsStore = db.createObjectStore('participants', { keyPath: 'id' });
        participantsStore.createIndex('email', 'email', { unique: true });
        participantsStore.createIndex('status', 'status', { unique: false });
        participantsStore.createIndex('registeredAt', 'registeredAt', { unique: false });
        participantsStore.createIndex('archivedAt', 'archivedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('activity')) {
        db.createObjectStore('activity', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error('Не удалось открыть IndexedDB: ' + event.target.error));
    };
  });
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getAll(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Ошибка чтения из ' + storeName));
    });
  });
}

function getById(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Ошибка чтения из ' + storeName));
    });
  });
}

function put(storeName, data) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Ошибка записи в ' + storeName));
    });
  });
}

function putAll(storeName, items) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Ошибка пакетной записи в ' + storeName));
    });
  });
}

function clearStore(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Ошибка очистки ' + storeName));
    });
  });
}

function deleteById(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Ошибка удаления из ' + storeName));
    });
  });
}

/* --- Операции с участниками --- */

const participantsDB = {
  getAll() {
    return getAll('participants');
  },

  getById(id) {
    return getById('participants', id);
  },

  add(participant) {
    const record = {
      ...participant,
      email: (participant.email || '').toLowerCase(),
      id: generateId(),
      registeredAt: participant.registeredAt || new Date().toISOString(),
      archivedAt: null,
    };
    return put('participants', record);
  },

  update(id, data) {
    return getById('participants', id).then((existing) => {
      if (!existing) {
        throw new Error('Участник не найден');
      }
      const updated = {
        ...existing,
        ...data,
        id,
        email: (data.email !== undefined ? data.email : existing.email).toLowerCase(),
        registeredAt: existing.registeredAt || data.registeredAt || new Date().toISOString(),
      };
      return put('participants', updated);
    });
  },

  archive(id) {
    return getById('participants', id).then((existing) => {
      if (!existing) {
        throw new Error('Участник не найден');
      }
      const updated = { ...existing, archivedAt: new Date().toISOString() };
      return put('participants', updated);
    });
  },

  unarchive(id) {
    return getById('participants', id).then((existing) => {
      if (!existing) {
        throw new Error('Участник не найден');
      }
      const updated = { ...existing, archivedAt: null };
      return put('participants', updated);
    });
  },

  checkIn(id) {
    return getById('participants', id).then((existing) => {
      if (!existing) {
        throw new Error('Участник не найден');
      }
      if (existing.status !== 'confirmed') {
        throw new Error('Отметка прихода доступна только для подтверждённых участников');
      }
      const updated = { ...existing, checkedIn: true };
      return put('participants', updated);
    });
  },

  checkByEmail(email) {
    return getAll('participants').then((participants) => {
      const emailLower = email.toLowerCase();
      return participants.find((p) => p.email.toLowerCase() === emailLower);
    });
  },

  addBatch(records) {
    const toInsert = records.map((r) => ({
      ...r,
      id: r.id || generateId(),
      archivedAt: r.archivedAt || null,
    }));
    return putAll('participants', toInsert);
  },
};

/* --- Операции с журналом --- */

const activityDB = {
  getAll() {
    return getAll('activity');
  },

  add(entry) {
    const record = {
      ...entry,
      id: generateId(),
      timestamp: entry.timestamp || new Date().toISOString(),
    };
    return put('activity', record);
  },

  addBatch(entries) {
    const toInsert = entries.map((e) => ({
      ...e,
      id: e.id || generateId(),
      timestamp: e.timestamp || new Date().toISOString(),
    }));
    return putAll('activity', toInsert);
  },

  clear() {
    return clearStore('activity');
  },
};

/* --- Операции с настройками --- */

const settingsDB = {
  get(key) {
    return getById('settings', key).then((record) => (record ? record.value : null));
  },

  set(key, value) {
    return put('settings', { key, value });
  },

  getAll() {
    return getAll('settings');
  },
};

/* --- Импорт (транзакция: participants + activity) --- */

function importParticipants(participantRecords, activityEntries) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['participants', 'activity'], 'readwrite');
      const pStore = tx.objectStore('participants');
      const aStore = tx.objectStore('activity');

      participantRecords.forEach((r) => {
        pStore.put({
          ...r,
          email: (r.email || '').toLowerCase(),
          id: r.id || generateId(),
          archivedAt: r.archivedAt || null,
        });
      });

      activityEntries.forEach((e) => {
        aStore.put({
          ...e,
          id: e.id || generateId(),
          timestamp: e.timestamp || new Date().toISOString(),
        });
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Ошибка транзакции импорта'));
    });
  });
}

/* --- Восстановление (транзакция: все три хранилища) --- */

function restoreBackup(participants, activity, settings) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['participants', 'activity', 'settings'], 'readwrite');
      const pStore = tx.objectStore('participants');
      const aStore = tx.objectStore('activity');
      const sStore = tx.objectStore('settings');

      pStore.clear();
      aStore.clear();
      sStore.clear();

      participants.forEach((r) => pStore.put(r));
      activity.forEach((e) => aStore.put(e));
      settings.forEach((s) => sStore.put(s));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Ошибка транзакции восстановления'));
    });
  });
}

/* --- Экспорт --- */

function exportBackup() {
  return Promise.all([
    getAll('participants'),
    getAll('activity'),
    getAll('settings'),
  ]).then(([participants, activity, settingsRecords]) => {
    const eventRecord = settingsRecords.find((s) => s.key === 'event');
    const otherSettings = settingsRecords.filter((s) => s.key !== 'event');
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      event: eventRecord ? eventRecord.value : null,
      participants,
      activity,
      settings: otherSettings,
    };
  });
}

function getRestoreSettings(backup) {
  const settings = Array.isArray(backup.settings) ? backup.settings.slice() : [];
  if (backup.event && !settings.some((s) => s.key === 'event')) {
    settings.push({ key: 'event', value: backup.event });
  }
  return settings;
}
