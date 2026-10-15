/**
 * Armazenamento local. IndexedDB no navegador; memória como alternativa quando o
 * IndexedDB não está disponível (e para os testes em Node).
 */

export const STORES = ['kv', 'sessions', 'results', 'videoAnalyses', 'frames'] as const;
export type StoreName = (typeof STORES)[number];

export type BatchOp =
  | { type: 'put'; store: StoreName; value: unknown }
  | { type: 'delete'; store: StoreName; key: string }
  | { type: 'clear'; store: StoreName };

export interface Backend {
  readonly kind: 'indexeddb' | 'memoria';
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Executa todas as operações em uma única transação (tudo ou nada). */
  batch(ops: BatchOp[]): Promise<void>;
  close(): void;
}

export class StorageError extends Error {
  readonly code: 'cheio' | 'indisponivel' | 'bloqueado' | 'desconhecido';
  constructor(code: StorageError['code'], message: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

export function friendlyStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError') {
    return new StorageError(
      'cheio',
      'O armazenamento do navegador está cheio. Exporte seus dados, apague registros antigos ou libere espaço no aparelho.',
    );
  }
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError') {
    return new StorageError(
      'indisponivel',
      'O armazenamento local não está disponível neste modo do navegador (por exemplo, aba anônima).',
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new StorageError('desconhecido', `Falha ao acessar os dados locais: ${message}`);
}

const KEY_PATH: Record<StoreName, string> = {
  kv: 'key',
  sessions: 'id',
  results: 'id',
  videoAnalyses: 'id',
  frames: 'id',
};

function keyOf(store: StoreName, value: unknown): string {
  const key = (value as Record<string, unknown> | null)?.[KEY_PATH[store]];
  if (typeof key !== 'string' || key.length === 0) {
    throw new StorageError('desconhecido', `Registro sem chave em ${store}`);
  }
  return key;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : value;
}

/** Armazenamento em memória (sem persistência). */
export class MemoryBackend implements Backend {
  readonly kind = 'memoria' as const;
  private data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const value = this.data.get(store)?.get(key);
    return value === undefined ? undefined : clone(value as T);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...(this.data.get(store)?.values() ?? [])].map((v) => clone(v as T));
  }

  async batch(ops: BatchOp[]): Promise<void> {
    // Valida tudo antes de aplicar (atomicidade).
    const prepared = ops.map((op) => (op.type === 'put' ? { ...op, key: keyOf(op.store, op.value) } : op));
    for (const op of prepared) {
      const map = this.data.get(op.store) as Map<string, unknown>;
      if (op.type === 'clear') map.clear();
      else if (op.type === 'delete') map.delete(op.key);
      else map.set((op as { key: string }).key, clone(op.value));
    }
  }

  close(): void {}
}

export const DB_NAME = 'claudio-futebol-ai';
export const DB_VERSION = 1;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IdbBackend implements Backend {
  readonly kind = 'indexeddb' as const;
  private readonly db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
    db.onversionchange = () => db.close();
  }

  static async open(factory: IDBFactory = indexedDB): Promise<IdbBackend> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(friendlyStorageError(error));
        return;
      }
      request.onupgradeneeded = () => {
        const upgrade = request.result;
        for (const store of STORES) {
          if (!upgrade.objectStoreNames.contains(store)) {
            const os = upgrade.createObjectStore(store, { keyPath: KEY_PATH[store] });
            if (store === 'sessions' || store === 'results') os.createIndex('date', 'date');
            if (store === 'results') os.createIndex('sessionId', 'sessionId');
            if (store === 'frames') os.createIndex('analysisId', 'analysisId');
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(friendlyStorageError(request.error));
      request.onblocked = () =>
        reject(
          new StorageError(
            'bloqueado',
            'O banco de dados está aberto em outra aba com uma versão diferente. Feche as outras abas do aplicativo e recarregue.',
          ),
        );
    });
    return new IdbBackend(db);
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    try {
      const tx = this.db.transaction(store, 'readonly');
      return (await promisify(tx.objectStore(store).get(key))) as T | undefined;
    } catch (error) {
      throw friendlyStorageError(error);
    }
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    try {
      const tx = this.db.transaction(store, 'readonly');
      return (await promisify(tx.objectStore(store).getAll())) as T[];
    } catch (error) {
      throw friendlyStorageError(error);
    }
  }

  async batch(ops: BatchOp[]): Promise<void> {
    if (ops.length === 0) return;
    const stores = [...new Set(ops.map((op) => op.store))];
    await new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(stores, 'readwrite');
      } catch (error) {
        reject(friendlyStorageError(error));
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(friendlyStorageError(tx.error));
      tx.onabort = () => reject(friendlyStorageError(tx.error ?? new Error('Transação cancelada')));
      try {
        for (const op of ops) {
          const os = tx.objectStore(op.store);
          if (op.type === 'clear') os.clear();
          else if (op.type === 'delete') os.delete(op.key);
          else os.put(op.value);
        }
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // a transação já pode ter sido encerrada
        }
        reject(friendlyStorageError(error));
      }
    });
  }

  close(): void {
    this.db.close();
  }
}

/** Abre o IndexedDB; se não for possível, usa memória e informa o motivo. */
export async function openBackend(): Promise<{ backend: Backend; warning?: string }> {
  if (typeof indexedDB === 'undefined') {
    return {
      backend: new MemoryBackend(),
      warning: 'Este navegador não oferece armazenamento local: seus dados não serão salvos ao fechar o aplicativo.',
    };
  }
  try {
    return { backend: await IdbBackend.open() };
  } catch (error) {
    const friendly = friendlyStorageError(error);
    return {
      backend: new MemoryBackend(),
      warning: `${friendly.message} Enquanto isso, seus dados ficam só nesta sessão e serão perdidos ao fechar.`,
    };
  }
}
