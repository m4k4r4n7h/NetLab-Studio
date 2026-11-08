import type { Project, ProjectSummary } from '../types';

const DB_NAME = 'netlab-studio';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const PREFERENCE_STORE = 'preferences';

interface StoredProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deviceCount: number;
  linkCount: number;
  project: Project;
}

interface PreferenceRecord {
  key: string;
  value: unknown;
}

let databasePromise: Promise<IDBDatabase> | null = null;
const memoryProjects = new Map<string, StoredProject>();
const memoryPreferences = new Map<string, unknown>();

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PREFERENCE_STORE)) {
        database.createObjectStore(PREFERENCE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local project database.'));
    request.onblocked = () => reject(new Error('The local project database is blocked by another tab.'));
  });
  return databasePromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function storedRecord(project: Project): StoredProject {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    deviceCount: project.devices.length,
    linkCount: project.links.length,
    project
  };
}

function summaryOf(record: StoredProject): ProjectSummary {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deviceCount: record.deviceCount,
    linkCount: record.linkCount
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, 'readonly');
    const records = await requestToPromise<StoredProject[]>(transaction.objectStore(PROJECT_STORE).getAll());
    return records.map(summaryOf).sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [...memoryProjects.values()].map(summaryOf).sort((left, right) => right.updatedAt - left.updatedAt);
  }
}

export async function loadProject(id: string): Promise<Project | null> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, 'readonly');
    const record = await requestToPromise<StoredProject | undefined>(transaction.objectStore(PROJECT_STORE).get(id));
    return record?.project ?? null;
  } catch {
    return memoryProjects.get(id)?.project ?? null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  const record = storedRecord(project);
  try {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(PROJECT_STORE).put(record));
  } catch {
    memoryProjects.set(project.id, record);
  }
}

export async function deleteProjectRecord(id: string): Promise<void> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(PROJECT_STORE).delete(id));
  } catch {
    memoryProjects.delete(id);
  }
}

export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(PREFERENCE_STORE, 'readonly');
    const record = await requestToPromise<PreferenceRecord | undefined>(transaction.objectStore(PREFERENCE_STORE).get(key));
    return record ? (record.value as T) : fallback;
  } catch {
    return memoryPreferences.has(key) ? (memoryPreferences.get(key) as T) : fallback;
  }
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(PREFERENCE_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(PREFERENCE_STORE).put({ key, value }));
  } catch {
    memoryPreferences.set(key, value);
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return false;
  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

export async function listStoredProjectRecords(): Promise<ProjectSummary[]> {
  return listProjects();
}
