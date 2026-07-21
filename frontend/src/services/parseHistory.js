const DB_NAME = "video_parse_history";
const DB_VERSION = 1;
const STORE_NAME = "records";
const LEGACY_STORAGE_KEY = "video_dl_history";
const MAX_RECORDS = 50;

const ARTIFACT_FIELDS = [
  "subtitles",
  "segments",
  "language",
  "subtitle_type",
  "summary_text",
  "mindmap_text",
];

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cleanKeyPart(value, fallback) {
  const clean = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

export function buildRecordKey(video) {
  if (video?.record_key) return cleanKeyPart(video.record_key, "video");
  if (video?.id) {
    const platform = cleanKeyPart(video.extractor || "video", "video").toLowerCase();
    return `${platform}_${cleanKeyPart(video.id, "item")}`;
  }
  return `video_${hashText(String(video?.webpage_url || video?.url || ""))}`;
}

export function mergeParseRecord(existing = {}, incoming = {}) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) continue;
    if (
      ARTIFACT_FIELDS.includes(key) &&
      (value === "" || (Array.isArray(value) && value.length === 0)) &&
      existing[key] &&
      (!Array.isArray(existing[key]) || existing[key].length > 0)
    ) {
      continue;
    }
    merged[key] = value;
  }
  for (const field of ARTIFACT_FIELDS) {
    if (!(field in incoming) && field in existing) merged[field] = existing[field];
  }
  return merged;
}

export function buildParseRecord(video, artifacts = {}) {
  const now = Date.now();
  const record = {
    record_key: buildRecordKey(video),
    id: video?.id || "",
    title: video?.title || "未命名视频",
    thumbnail: video?.thumbnail || "",
    uploader: video?.uploader || "",
    extractor: video?.extractor || "",
    duration: video?.duration || 0,
    duration_string: video?.duration_string || "",
    webpage_url: video?.webpage_url || video?.url || "",
    filename: video?.filename || "",
    parsed_at: video?.parsed_at || now,
    downloaded_at: video?.downloaded_at || 0,
    updated_at: now,
  };
  for (const field of ARTIFACT_FIELDS) {
    if (field in artifacts) {
      record[field] =
        field === "segments"
          ? Array.isArray(artifacts[field])
            ? artifacts[field]
            : []
          : artifacts[field] || "";
    }
  }
  return record;
}

export function convertLegacyDownload(item) {
  const parsedTime = Date.parse(item?.downloadedAt || "") || Date.now();
  return buildParseRecord(
    {
      ...item,
      parsed_at: parsedTime,
      downloaded_at: parsedTime,
    },
    {},
  );
}

function getScope(user) {
  return user?.id ? `user:${user.id}` : "guest";
}

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(STORE_NAME, {
        keyPath: "storage_key",
      });
      store.createIndex("owner_scope", "owner_scope", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const completion = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const result = await callback(store);
    await completion;
    return result;
  } finally {
    database.close();
  }
}

async function getLocalRecord(scope, recordKey) {
  return withStore("readonly", (store) =>
    requestResult(store.get(`${scope}:${recordKey}`)),
  );
}

async function putLocalRecord(scope, record) {
  const stored = {
    ...record,
    owner_scope: scope,
    storage_key: `${scope}:${record.record_key}`,
  };
  await withStore("readwrite", (store) => requestResult(store.put(stored)));
  return record;
}

async function getLocalRecords(scope, limit = MAX_RECORDS) {
  const records = await withStore("readonly", (store) =>
    requestResult(store.index("owner_scope").getAll(scope)),
  );
  const sorted = records
    .map(({ owner_scope, storage_key, ...record }) => record)
    .sort((left, right) => (right.updated_at || 0) - (left.updated_at || 0));
  return limit ? sorted.slice(0, limit) : sorted;
}

async function deleteLocalScope(scope) {
  await withStore("readwrite", async (store) => {
    const records = await requestResult(store.index("owner_scope").getAllKeys(scope));
    await Promise.all(records.map((key) => requestResult(store.delete(key))));
  });
}

async function trimLocalScope(scope) {
  const records = await getLocalRecords(scope, 0);
  if (records.length <= MAX_RECORDS) return;
  await withStore("readwrite", async (store) => {
    const stale = records.slice(MAX_RECORDS);
    await Promise.all(
      stale.map((record) =>
        requestResult(store.delete(`${scope}:${record.record_key}`)),
      ),
    );
  });
}

function notifyHistoryUpdated() {
  window.dispatchEvent(new CustomEvent("parse-history-updated"));
}

async function uploadRecord(record) {
  const response = await fetch("/api/parse-history", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      video: Object.fromEntries(
        Object.entries(record).filter(([key]) => !ARTIFACT_FIELDS.includes(key)),
      ),
      artifacts: Object.fromEntries(
        ARTIFACT_FIELDS.map((key) => [key, record[key]]),
      ),
    }),
  });
  if (!response.ok) throw new Error(`解析历史同步失败: ${response.status}`);
  const data = await response.json();
  return data.record;
}

async function migrateLegacyHistory(user) {
  const scope = getScope(user);
  const marker = `parse_history_migrated:${scope}`;
  if (localStorage.getItem(marker)) return;

  let legacy = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
  } catch {
    legacy = [];
  }

  for (const item of legacy) {
    const record = convertLegacyDownload(item);
    await putLocalRecord(scope, record);
    if (user?.id) {
      try {
        const remote = await uploadRecord(record);
        await putLocalRecord(scope, remote);
      } catch {
        // Keep the local migration; the next load will retry server merging.
      }
    }
  }
  localStorage.setItem(marker, "1");
}

export async function saveParseRecord(video, artifacts = {}, user = null) {
  const scope = getScope(user);
  const built = buildParseRecord(video, artifacts);
  const existing = await getLocalRecord(scope, built.record_key);
  let record = mergeParseRecord(existing || {}, built);
  await putLocalRecord(scope, record);

  if (user?.id) {
    try {
      record = mergeParseRecord(record, await uploadRecord(record));
      await putLocalRecord(scope, record);
    } catch {
      // Local cache remains the source of truth until connectivity returns.
    }
  }

  await trimLocalScope(scope);
  notifyHistoryUpdated();
  return record;
}

export async function updateParseArtifacts(
  recordKey,
  artifacts,
  user = null,
) {
  const scope = getScope(user);
  const existing = await getLocalRecord(scope, recordKey);
  if (!existing) return null;
  let record = mergeParseRecord(existing, {
    ...artifacts,
    updated_at: Date.now(),
  });
  await putLocalRecord(scope, record);

  if (user?.id) {
    try {
      const response = await fetch(
        `/api/parse-history/${encodeURIComponent(recordKey)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ artifacts }),
        },
      );
      if (response.ok) {
        const data = await response.json();
        record = mergeParseRecord(record, data.record);
        await putLocalRecord(scope, record);
      }
    } catch {
      // Keep local artifacts; base-record synchronization will merge them later.
    }
  }

  notifyHistoryUpdated();
  return record;
}

export async function updateParseMetadata(recordKey, patch, user = null) {
  const scope = getScope(user);
  const existing = await getLocalRecord(scope, recordKey);
  if (!existing) return null;
  return saveParseRecord(
    mergeParseRecord(existing, { ...patch, record_key: recordKey }),
    Object.fromEntries(ARTIFACT_FIELDS.map((key) => [key, existing[key]])),
    user,
  );
}

export async function loadParseHistory(user = null) {
  const scope = getScope(user);
  await migrateLegacyHistory(user);
  const merged = new Map(
    (await getLocalRecords(scope)).map((record) => [record.record_key, record]),
  );

  if (user?.id) {
    try {
      const response = await fetch("/api/parse-history", {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        for (const remote of data.records || []) {
          const record = mergeParseRecord(merged.get(remote.record_key) || {}, remote);
          merged.set(record.record_key, record);
          await putLocalRecord(scope, record);
        }
      }
    } catch {
      // Offline mode uses IndexedDB records.
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => (right.updated_at || 0) - (left.updated_at || 0))
    .slice(0, MAX_RECORDS);
}

export async function clearParseHistory(user = null) {
  const scope = getScope(user);
  await deleteLocalScope(scope);
  if (user?.id) {
    try {
      await fetch("/api/parse-history", {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      // Local clear still succeeds when offline.
    }
  }
  notifyHistoryUpdated();
}
