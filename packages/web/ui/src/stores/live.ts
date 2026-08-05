import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  AdminSocket,
  setAdminSocket,
  type SnapshotData,
} from "@/api/adminSocket";
import type {
  BbsBoard,
  DboStub,
  Job,
  JobStats,
  Me,
  OnlinePlayer,
  StaffBadge,
  StaffNavItem,
  StaffSideNavRegistration,
  WikiStub,
} from "@/api/types";
import {
  dboType,
  normalizeObjectList,
  onlineDisplayName,
} from "@/utils/text";

export type LiveMode = "ws" | "connecting" | "off";

/**
 * Persist "seen" badge values across logins (localStorage).
 * sessionStorage reset every new tab/login, so the same drafts /
 * open jobs looked like fresh notifications forever.
 * Key is scoped per staff id when known.
 */
const BADGE_ACK_PREFIX = "ursamu.staff.badgeAck.v2";

function isOpenStatus(status: string): boolean {
  return status !== "closed" &&
    status !== "resolved" &&
    status !== "cancelled";
}

function ackStorageKey(userId?: string | null): string {
  const id = String(userId ?? "").trim();
  return id ? `${BADGE_ACK_PREFIX}.${id}` : BADGE_ACK_PREFIX;
}

function readBadgeAcks(
  userId?: string | null,
): Record<string, string> {
  try {
    const key = ackStorageKey(userId);
    let raw = localStorage.getItem(key);
    // One-time migrate from old sessionStorage blob
    if (!raw) {
      try {
        const legacy = sessionStorage.getItem(
          "ursamu.staff.badgeAck.v1",
        );
        if (legacy) {
          raw = legacy;
          localStorage.setItem(key, legacy);
          sessionStorage.removeItem("ursamu.staff.badgeAck.v1");
        }
      } catch {
        /* ignore */
      }
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeBadgeAcks(
  map: Record<string, string>,
  userId?: string | null,
): void {
  try {
    localStorage.setItem(
      ackStorageKey(userId),
      JSON.stringify(map),
    );
  } catch {
    /* private mode / quota — ignore */
  }
}

export const useLiveStore = defineStore("live", () => {
  const pages = ref<WikiStub[]>([]);
  const online = ref<OnlinePlayer[]>([]);
  const objects = ref<DboStub[]>([]);
  const jobs = ref<Job[]>([]);
  const jobStats = ref<JobStats | null>(null);
  const boards = ref<BbsBoard[]>([]);
  /** Plugin-contributed topbar entries. */
  const staffNav = ref<StaffNavItem[]>([]);
  /** pageId → side-nav groups (registerStaffSideNav). */
  const staffSideNav = ref<
    Record<string, StaffSideNavRegistration>
  >({});
  /** Live badges from plugins (Phase 3). */
  const staffBadges = ref<Record<string, StaffBadge>>({});
  /**
   * Last badge value the operator has "seen" by opening that tab.
   * Badge stays hidden while live value === ack; reappears when
   * the count/string changes (new activity). Survives logout via
   * localStorage (per staff id).
   */
  const badgeAck = ref<Record<string, string>>(readBadgeAcks());
  /** Staff id for scoped ack storage (set after login/snapshot). */
  let ackUserId: string | null = null;
  const pagesLoaded = ref(false);
  const onlineLoaded = ref(false);
  const objectsLoaded = ref(false);
  const jobsLoaded = ref(false);
  const boardsLoaded = ref(false);
  const lastError = ref("");
  const lastUpdated = ref(0);
  const refreshing = ref(false);
  const mode = ref<LiveMode>("off");
  const wsConnected = ref(false);
  /** Profile from WS snapshot (session may copy this). */
  const meFromWs = ref<Me | null>(null);
  const snapshotReady = ref(false);

  let running = false;
  let adminSock: AdminSocket | null = null;
  let snapshotWaiters: Array<(ok: boolean) => void> = [];

  const wikiTotal = computed(() => pages.value.length);
  const wikiDrafts = computed(
    () => pages.value.filter((p) => p.draft === true).length,
  );
  const wikiPublished = computed(
    () => wikiTotal.value - wikiDrafts.value,
  );
  const onlineCount = computed(() => online.value.length);
  const objectCount = computed(() => objects.value.length);
  const players = computed(() =>
    objects.value.filter((o) => dboType(o) === "player"),
  );
  const playerCount = computed(() => players.value.length);
  const roomCount = computed(
    () => objects.value.filter((o) => dboType(o) === "room").length,
  );

  const onlineIdSet = computed(() => {
    const s = new Set<string>();
    for (const p of online.value) {
      if (p.id != null) s.add(String(p.id).replace(/^#/, ""));
    }
    return s;
  });

  function isOnline(id: string | undefined | null): boolean {
    if (id == null) return false;
    return onlineIdSet.value.has(String(id).replace(/^#/, ""));
  }

  const jobsOpen = computed(
    () =>
      jobs.value.filter((j) => isOpenStatus(String(j.status)))
        .length,
  );
  const jobsNew = computed(
    () => jobs.value.filter((j) => j.status === "new").length,
  );
  const jobsUnassigned = computed(
    () =>
      jobs.value.filter(
        (j) => isOpenStatus(String(j.status)) && !j.assignedTo,
      ).length,
  );

  const boardCount = computed(() => boards.value.length);
  const boardPostTotal = computed(() =>
    boards.value.reduce(
      (n, b) => n + (Number(b.postCount) || 0),
      0,
    ),
  );
  const boardFlaggedTotal = computed(() =>
    boards.value.reduce(
      (n, b) => n + (Number(b.flaggedCount) || 0),
      0,
    ),
  );
  const bbsCategories = computed(() => {
    const set = new Set<string>();
    for (const b of boards.value) {
      set.add(String(b.category || "General"));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  const wikiSections = computed(() => {
    const set = new Set<string>();
    for (const p of pages.value) {
      const parts = String(p.path).split("/");
      set.add(parts.length > 1 ? parts[0]! : "(root)");
    }
    return set.size;
  });

  const recentPages = computed(() => {
    return [...pages.value]
      .sort((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da !== db) return db.localeCompare(da);
        return String(a.path).localeCompare(String(b.path));
      })
      .slice(0, 8);
  });

  const onlineSorted = computed(() =>
    [...online.value].sort((a, b) =>
      onlineDisplayName(a).localeCompare(onlineDisplayName(b)),
    ),
  );

  function touch(): void {
    lastUpdated.value = Date.now();
  }

  function resolveSnapshotWaiters(ok: boolean): void {
    const w = snapshotWaiters;
    snapshotWaiters = [];
    for (const fn of w) fn(ok);
  }

  function applySnapshot(data: SnapshotData): void {
    if (data.me && typeof data.me === "object") {
      meFromWs.value = data.me as Me;
    }
    if (Array.isArray(data.pages)) {
      pages.value = data.pages;
      pagesLoaded.value = true;
    }
    if (Array.isArray(data.online)) {
      online.value = data.online;
      onlineLoaded.value = true;
    }
    if (data.objects != null) {
      objects.value = normalizeObjectList(data.objects);
      objectsLoaded.value = true;
    }
    if (Array.isArray(data.jobs)) {
      jobs.value = data.jobs;
      jobsLoaded.value = true;
    }
    if (data.jobStats && typeof data.jobStats === "object") {
      jobStats.value = data.jobStats as JobStats;
    }
    // Always settle boardsLoaded so the UI never spins forever
    // when the snapshot predates boards or the BBS plugin is off.
    if (Array.isArray(data.boards)) {
      boards.value = data.boards as BbsBoard[];
    }
    boardsLoaded.value = true;
    if (Array.isArray(data.staffNav)) {
      staffNav.value = data.staffNav as StaffNavItem[];
    }
    if (data.staffSideNav && typeof data.staffSideNav === "object") {
      staffSideNav.value = data.staffSideNav as Record<
        string,
        StaffSideNavRegistration
      >;
    }
    if (data.staffBadges && typeof data.staffBadges === "object") {
      staffBadges.value = data.staffBadges as Record<
        string,
        StaffBadge
      >;
    }
    snapshotReady.value = true;
    refreshing.value = false;
    touch();
    resolveSnapshotWaiters(true);
  }

  function upsertPage(stub: WikiStub): void {
    const i = pages.value.findIndex((p) => p.path === stub.path);
    const next = [...pages.value];
    if (i >= 0) next[i] = { ...next[i], ...stub };
    else next.unshift(stub);
    pages.value = next;
    pagesLoaded.value = true;
    touch();
  }

  function removePage(path: string): void {
    pages.value = pages.value.filter((p) => p.path !== path);
    touch();
  }

  function upsertObject(obj: DboStub): void {
    const id = String(obj.id ?? "").replace(/^#/, "");
    if (!id) return;
    const i = objects.value.findIndex(
      (o) => String(o.id).replace(/^#/, "") === id,
    );
    const next = [...objects.value];
    if (i >= 0) {
      next[i] = {
        ...next[i],
        ...obj,
        id,
        data: { ...next[i]?.data, ...obj.data },
      };
    } else {
      next.unshift({ ...obj, id });
    }
    objects.value = next;
    objectsLoaded.value = true;
    touch();
  }

  function removeObject(rawId: string): void {
    const id = String(rawId).replace(/^#/, "");
    objects.value = objects.value.filter(
      (o) => String(o.id).replace(/^#/, "") !== id,
    );
    touch();
  }

  function upsertJob(job: Job): void {
    const i = jobs.value.findIndex(
      (j) => j.id === job.id || j.number === job.number,
    );
    const next = [...jobs.value];
    if (i >= 0) {
      next[i] = {
        ...next[i],
        ...job,
        comments: job.comments ?? next[i]!.comments,
      };
    } else {
      next.unshift(job);
    }
    next.sort((a, b) => b.number - a.number);
    jobs.value = next;
    jobsLoaded.value = true;
    const open = next.filter((j) => isOpenStatus(String(j.status)));
    jobStats.value = {
      total: next.length,
      byStatus: jobStats.value?.byStatus ?? {},
      byCategory: jobStats.value?.byCategory ?? {},
      byPriority: jobStats.value?.byPriority ?? {},
      openAssigned: open.filter((j) => j.assignedTo).length,
      openUnassigned: open.filter((j) => !j.assignedTo).length,
    };
    touch();
  }

  function removeJob(id: string, number?: number): void {
    jobs.value = jobs.value.filter(
      (j) => j.id !== id && (number == null || j.number !== number),
    );
    touch();
  }

  function getJob(idOrNum: string | number): Job | undefined {
    const key = String(idOrNum);
    return jobs.value.find(
      (j) => j.id === key || String(j.number) === key,
    );
  }

  function getObject(id: string | number): DboStub | undefined {
    const key = String(id).replace(/^#/, "");
    return objects.value.find((o) => String(o.id) === key);
  }

  function getPage(path: string): WikiStub | undefined {
    return pages.value.find((p) => p.path === path);
  }

  function upsertBoard(board: BbsBoard): void {
    const i = boards.value.findIndex(
      (b) =>
        b.id === board.id ||
        b.num === board.num,
    );
    const next = [...boards.value];
    if (i >= 0) next[i] = { ...next[i], ...board };
    else next.push(board);
    next.sort((a, b) => a.num - b.num);
    boards.value = next;
    boardsLoaded.value = true;
    touch();
  }

  function removeBoard(idOrNum: string | number): void {
    const key = String(idOrNum);
    boards.value = boards.value.filter(
      (b) => b.id !== key && String(b.num) !== key,
    );
    touch();
  }

  function getBoard(idOrNum: string | number): BbsBoard | undefined {
    const key = String(idOrNum);
    return boards.value.find(
      (b) => b.id === key || String(b.num) === key,
    );
  }

  function applyBadge(badge: StaffBadge): void {
    const next = { ...staffBadges.value };
    if (!badge.value) {
      delete next[badge.key];
    } else {
      next[badge.key] = { ...badge };
    }
    staffBadges.value = next;
    touch();
  }

  /**
   * Load ack map for this staff user (call after login).
   * Keeps chips hidden across sessions until values change.
   */
  function loadBadgeAcksForUser(userId: string | null | undefined): void {
    const id = String(userId ?? "").trim() || null;
    if (id === ackUserId) return;
    ackUserId = id;
    badgeAck.value = readBadgeAcks(id);
  }

  /**
   * Visible nav chip: empty when the operator already viewed
   * this exact count (ack). Re-shows when value changes.
   */
  function displayBadge(key: string, raw: string): string {
    const v = String(raw ?? "").trim();
    if (!v) return "";
    if (badgeAck.value[key] === v) return "";
    return v;
  }

  /** Mark badge as seen (call when its tab is opened). */
  function ackBadge(key: string, rawValue: string): void {
    const k = key.trim();
    if (!k) return;
    const v = String(rawValue ?? "").trim();
    if (badgeAck.value[k] === v) return;
    const next = { ...badgeAck.value, [k]: v };
    badgeAck.value = next;
    writeBadgeAcks(next, ackUserId);
  }

  /** Ack several keys at once (one tab may own multiple). */
  function ackBadges(
    entries: ReadonlyArray<{ key: string; value: string }>,
  ): void {
    let changed = false;
    const next = { ...badgeAck.value };
    for (const e of entries) {
      const k = e.key.trim();
      if (!k) continue;
      const v = String(e.value ?? "").trim();
      if (next[k] === v) continue;
      next[k] = v;
      changed = true;
    }
    if (!changed) return;
    badgeAck.value = next;
    writeBadgeAcks(next, ackUserId);
  }

  function ensureSocket(): AdminSocket {
    if (adminSock) return adminSock;
    adminSock = new AdminSocket({
      onOpen: () => {
        wsConnected.value = true;
        mode.value = "ws";
        refreshing.value = true;
      },
      onClose: () => {
        wsConnected.value = false;
        if (running) mode.value = "connecting";
        else mode.value = "off";
        if (!snapshotReady.value) {
          resolveSnapshotWaiters(false);
        }
      },
      onSnapshot: (data) => applySnapshot(data),
      onWikiUpsert: (p) => upsertPage(p),
      onWikiDelete: (path) => removePage(path),
      onJobUpsert: (j) => upsertJob(j),
      onJobDelete: (id, n) => removeJob(id, n),
      onObjectUpsert: (o) => upsertObject(o),
      onObjectDelete: (id) => removeObject(id),
      onBoardUpsert: (b) => upsertBoard(b),
      onBoardDelete: (id, n) => removeBoard(n ?? id),
      onBadgeSet: (b) => applyBadge(b),
      onStaffChrome: (data) => {
        staffNav.value = data.staffNav ?? [];
        staffSideNav.value = data.staffSideNav ?? {};
        touch();
      },
      onOnlineSet: (players) => {
        online.value = players;
        onlineLoaded.value = true;
        touch();
      },
      onTouch: () => touch(),
      onError: (message) => {
        lastError.value = message;
        if (!snapshotReady.value) {
          resolveSnapshotWaiters(false);
        }
      },
    });
    setAdminSocket(adminSock);
    return adminSock;
  }

  /**
   * Open the admin WebSocket and wait for the first snapshot.
   * Returns false if auth/connect fails within timeout.
   */
  function connect(timeoutMs = 15_000): Promise<boolean> {
    running = true;
    mode.value = "connecting";
    snapshotReady.value = false;
    const sock = ensureSocket();
    sock.start();

    if (snapshotReady.value) return Promise.resolve(true);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolveSnapshotWaiters(false);
      }, timeoutMs);
      snapshotWaiters.push((ok) => {
        clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  /** Start live channel (idempotent). Prefer connect() at bootstrap. */
  function startPolling(): void {
    if (running && adminSock) return;
    void connect();
  }

  function stopPolling(): void {
    running = false;
    resolveSnapshotWaiters(false);
    adminSock?.stop();
    adminSock = null;
    setAdminSocket(null);
    wsConnected.value = false;
    snapshotReady.value = false;
    mode.value = "off";
  }

  /** Re-request full snapshot over WS. */
  async function refreshAll(): Promise<void> {
    if (!adminSock?.connected) {
      await connect();
      return;
    }
    refreshing.value = true;
    lastError.value = "";
    adminSock.requestSnapshot();
  }

  async function refreshWiki(): Promise<void> {
    await refreshAll();
  }
  async function refreshOnline(): Promise<void> {
    await refreshAll();
  }
  async function refreshObjects(): Promise<void> {
    await refreshAll();
  }
  async function refreshJobs(): Promise<void> {
    await refreshAll();
  }
  async function refreshBoards(): Promise<void> {
    await refreshAll();
  }

  return {
    pages,
    online,
    objects,
    jobs,
    jobStats,
    boards,
    staffNav,
    staffSideNav,
    staffBadges,
    badgeAck,
    loadBadgeAcksForUser,
    displayBadge,
    ackBadge,
    ackBadges,
    pagesLoaded,
    onlineLoaded,
    objectsLoaded,
    jobsLoaded,
    boardsLoaded,
    lastError,
    lastUpdated,
    refreshing,
    mode,
    wsConnected,
    meFromWs,
    snapshotReady,
    wikiTotal,
    wikiDrafts,
    wikiPublished,
    onlineCount,
    objectCount,
    players,
    playerCount,
    roomCount,
    onlineIdSet,
    isOnline,
    jobsOpen,
    jobsNew,
    jobsUnassigned,
    boardCount,
    boardPostTotal,
    boardFlaggedTotal,
    bbsCategories,
    wikiSections,
    recentPages,
    onlineSorted,
    upsertPage,
    removePage,
    upsertObject,
    removeObject,
    upsertJob,
    removeJob,
    upsertBoard,
    removeBoard,
    getJob,
    getObject,
    getPage,
    getBoard,
    refreshWiki,
    refreshOnline,
    refreshObjects,
    refreshJobs,
    refreshBoards,
    refreshAll,
    connect,
    startPolling,
    stopPolling,
  };
});
