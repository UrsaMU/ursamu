<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import {
  RouterLink,
  RouterView,
  useRoute,
  useRouter,
} from "vue-router";
import { storeToRefs } from "pinia";
import { useSessionStore } from "@/stores/session";
import { useLiveStore } from "@/stores/live";

const session = useSessionStore();
const live = useLiveStore();
const {
  refreshing,
  lastUpdated,
  onlineLoaded,
  onlineCount,
  objectsLoaded,
  playerCount,
  pagesLoaded,
  pages,
  wikiDrafts,
  jobsLoaded,
  jobsOpen,
  jobsNew,
  boardsLoaded,
  boardCount,
  boardFlaggedTotal,
  bbsCategories,
  boards,
  staffNav,
  staffBadges,
  mode,
  wsConnected,
} = storeToRefs(live);
const router = useRouter();
const route = useRoute();
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

type Section =
  | "dashboard"
  | "wiki"
  | "players"
  | "jobs"
  | "bbs"
  | "db"
  | "settings";

const section = computed<Section>(() => {
  const n = String(route.name ?? "");
  if (n === "dashboard" || n === "") return "dashboard";
  if (n.startsWith("wiki")) return "wiki";
  if (n.startsWith("player")) return "players";
  if (n.startsWith("job")) return "jobs";
  if (n.startsWith("bbs")) return "bbs";
  if (n.startsWith("db")) return "db";
  if (n === "settings") return "settings";
  return "dashboard";
});

/** Plugin-contributed section titles win over host hardcodes. */
const sectionTitle = computed(() => {
  const plug = staffNav.value.find((p) => p.id === section.value);
  if (plug?.label) return plug.label;
  switch (section.value) {
    case "wiki":
      return "Wiki";
    case "players":
      return "Players";
    case "jobs":
      return "Jobs";
    case "db":
      return "Database";
    case "settings":
      return "Settings";
    default:
      return "Shortcuts";
  }
});

type PrimaryItem = {
  id: string;
  name?: string;
  label: string;
  href?: string;
  order: number;
  badge: string;
  badgeTitle?: string;
};

/** Raw count string before clear-on-view filtering. */
function rawBadgeForKey(key: string | undefined): {
  badge: string;
  badgeTitle?: string;
} {
  if (!key) return { badge: "" };
  // Phase 3: plugin-pushed badges win.
  const pushed = staffBadges.value[key];
  if (pushed) {
    return {
      badge: pushed.value || "",
      badgeTitle: pushed.title,
    };
  }
  // Host fallbacks until plugins/core publish live badges.
  switch (key) {
    case "bbs:flagged":
      return {
        badge: boardsLoaded.value && boardFlaggedTotal.value > 0
          ? String(boardFlaggedTotal.value)
          : "",
        badgeTitle: "Flagged posts",
      };
    case "bbs:activity":
      // No host fallback — only live push from the plugin.
      return { badge: "", badgeTitle: "New BBS activity" };
    case "jobs:open":
      return {
        badge: jobsLoaded.value && jobsOpen.value > 0
          ? String(jobsOpen.value)
          : "",
        badgeTitle: "Open jobs",
      };
    case "wiki:drafts":
      return {
        badge: pagesLoaded.value && wikiDrafts.value > 0
          ? String(wikiDrafts.value)
          : "",
        badgeTitle: "Drafts",
      };
    case "players:online":
      return {
        badge: onlineLoaded.value && onlineCount.value > 0
          ? String(onlineCount.value)
          : "",
        badgeTitle: "Online now",
      };
    default:
      return { badge: "" };
  }
}

/** Chip shown in the topbar — hidden after the tab is viewed. */
function badgeForKey(key: string | undefined): {
  badge: string;
  badgeTitle?: string;
} {
  const raw = rawBadgeForKey(key);
  if (!key || !raw.badge) return raw;
  return {
    badge: live.displayBadge(key, raw.badge),
    badgeTitle: raw.badgeTitle,
  };
}

/** Badge keys owned by a top-level section (for clear-on-view). */
function badgeKeysForSection(sec: Section): string[] {
  const keys: string[] = [];
  const host: Partial<Record<Section, string>> = {
    wiki: "wiki:drafts",
    players: "players:online",
    jobs: "jobs:open",
    bbs: "bbs:activity",
  };
  const h = host[sec];
  if (h) keys.push(h);
  for (const p of staffNav.value) {
    if (p.id === sec && p.badgeKey) keys.push(p.badgeKey);
  }
  return [...new Set(keys)];
}

/** Ack current badge values when the operator opens a tab. */
function ackSectionBadges(sec: Section): void {
  const entries = badgeKeysForSection(sec).map((key) => ({
    key,
    value: rawBadgeForKey(key).badge,
  }));
  if (entries.length) live.ackBadges(entries);
}

/**
 * Built-in host sections. Plugin tabs (Wiki, Jobs, Boards, …)
 * register via registerStaffNav — never hard-code them here.
 */
const CORE_PRIMARY: Omit<PrimaryItem, "badge" | "badgeTitle">[] = [
  { id: "dashboard", name: "dashboard", label: "Dashboard", order: 10 },
  { id: "players", name: "players", label: "Players", order: 30 },
  { id: "db", name: "db", label: "Database", order: 60 },
  { id: "settings", name: "settings", label: "Settings", order: 90 },
];

const primary = computed((): PrimaryItem[] => {
  const core: PrimaryItem[] = CORE_PRIMARY.map((c) => {
    let badge = "";
    let badgeTitle: string | undefined;
    if (c.id === "players") {
      ({ badge, badgeTitle } = badgeForKey("players:online"));
    }
    return { ...c, badge, badgeTitle };
  });

  const pluginIds = new Set(
    staffNav.value.map((p) => p.id),
  );
  // Drop core slots only if a plugin re-uses the same id.
  const base = core.filter((c) => !pluginIds.has(c.id));

  const plugins: PrimaryItem[] = staffNav.value.map((p) => {
    const b = badgeForKey(p.badgeKey);
    // Phase 2: prefer in-console route when set; href is fallback.
    const hasRoute = Boolean(p.route?.trim());
    return {
      id: p.id,
      label: p.label,
      name: hasRoute ? p.route : undefined,
      href: hasRoute ? undefined : p.href,
      order: p.order ?? 100,
      badge: b.badge,
      badgeTitle: p.badgeTitle || b.badgeTitle,
    };
  });

  return [...base, ...plugins].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
});

type SideLink = {
  to: { name: string; query?: Record<string, string> };
  label: string;
  desc?: string;
  icon?: string;
  /** Explicit highlight (for toggle links whose `to` clears the value). */
  match?: {
    filter?: string;
    tag?: string;
    section?: string;
  };
};

/** Wiki path prefix before first `/`, or `(root)`. */
function wikiSectionOf(path: string): string {
  const parts = String(path).split("/");
  return parts.length > 1 ? parts[0]! : "(root)";
}

const wikiTagCounts = computed(() => {
  const m = new Map<string, number>();
  for (const p of pages.value) {
    for (const t of p.tags || []) {
      const k = String(t).toLowerCase();
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
});

const wikiSectionCounts = computed(() => {
  const m = new Map<string, number>();
  for (const p of pages.value) {
    const s = wikiSectionOf(String(p.path));
    m.set(s, (m.get(s) || 0) + 1);
  }
  return [...m.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
});

const activeWikiFilter = computed(() => {
  const f = route.query.filter;
  return f === "drafts" || f === "published" ? f : "";
});

const activeWikiTag = computed(() =>
  typeof route.query.tag === "string" ? route.query.tag : "",
);

const activeWikiSection = computed(() =>
  typeof route.query.section === "string" ? route.query.section : "",
);

/** Build wiki list query; omit empty keys. */
function wikiListQuery(
  opts: {
    filter?: string;
    tag?: string;
    section?: string;
  },
): Record<string, string> {
  const q: Record<string, string> = {};
  if (opts.filter) q.filter = opts.filter;
  if (opts.tag) q.tag = opts.tag;
  if (opts.section) q.section = opts.section;
  return q;
}

const wikiStatusLinks = computed((): SideLink[] => {
  const tag = activeWikiTag.value;
  const sec = activeWikiSection.value;
  return [
    {
      to: {
        name: "wiki",
        query: wikiListQuery({ tag, section: sec }),
      },
      label: "All pages",
      desc: "Browse & filter",
      icon: "¶",
    },
    {
      to: {
        name: "wiki",
        query: wikiListQuery({
          filter: "drafts",
          tag,
          section: sec,
        }),
      },
      label: "Drafts",
      desc: pagesLoaded.value
        ? `${wikiDrafts.value} draft${
          wikiDrafts.value === 1 ? "" : "s"
        }`
        : "Staff-only",
      icon: "◇",
    },
    {
      to: {
        name: "wiki",
        query: wikiListQuery({
          filter: "published",
          tag,
          section: sec,
        }),
      },
      label: "Published",
      desc: "Live pages",
      icon: "✓",
    },
    {
      to: { name: "wiki-new" },
      label: "New page",
      desc: "Create entry",
      icon: "+",
    },
  ];
});

const wikiTagLinks = computed((): SideLink[] => {
  const filter = activeWikiFilter.value;
  const cur = activeWikiTag.value;
  return wikiTagCounts.value.map(([tag, count]) => ({
    to: {
      name: "wiki",
      // Toggle off when already selected
      query: wikiListQuery({
        filter,
        tag: cur === tag ? "" : tag,
      }),
    },
    label: tag,
    desc: String(count),
    icon: "#",
    match: { filter, tag, section: "" },
  }));
});

const wikiSectionLinks = computed((): SideLink[] => {
  const filter = activeWikiFilter.value;
  const cur = activeWikiSection.value;
  return wikiSectionCounts.value.map(([name, count]) => ({
    to: {
      name: "wiki",
      query: wikiListQuery({
        filter,
        section: cur === name ? "" : name,
      }),
    },
    label: name,
    desc: String(count),
    icon: "/",
    match: { filter, tag: "", section: name },
  }));
});

const sideLinks = computed((): SideLink[] => {
  switch (section.value) {
    case "wiki":
      return wikiStatusLinks.value;
    case "players":
      return [
        {
          to: { name: "players" },
          label: "All players",
          desc: objectsLoaded.value
            ? `${playerCount.value} accounts`
            : "Accounts",
          icon: "◎",
        },
        {
          to: { name: "players", query: { filter: "online" } },
          label: "Online",
          desc: onlineLoaded.value
            ? `${onlineCount.value} connected`
            : "Connected now",
          icon: "●",
        },
        {
          to: { name: "players", query: { filter: "offline" } },
          label: "Offline",
          desc: "Not connected",
          icon: "○",
        },
        {
          to: { name: "players", query: { filter: "staff" } },
          label: "Staff",
          desc: "Admin & wizard",
          icon: "★",
        },
      ];
    case "jobs":
      return [
        {
          to: { name: "jobs" },
          label: "Open",
          desc: jobsLoaded.value
            ? `${jobsOpen.value} open`
            : "Active queue",
          icon: "☰",
        },
        {
          to: { name: "jobs", query: { filter: "new" } },
          label: "New",
          desc: jobsLoaded.value
            ? `${jobsNew.value} untriaged`
            : "Needs triage",
          icon: "!",
        },
        {
          to: { name: "jobs", query: { filter: "unassigned" } },
          label: "Unassigned",
          desc: "No owner yet",
          icon: "○",
        },
        {
          to: { name: "jobs", query: { filter: "mine" } },
          label: "Mine",
          desc: "Assigned to you",
          icon: "→",
        },
        {
          to: { name: "jobs", query: { filter: "closed" } },
          label: "Closed",
          desc: "Resolved queue",
          icon: "×",
        },
        {
          to: { name: "jobs", query: { filter: "all" } },
          label: "All jobs",
          desc: "Every status",
          icon: "⋯",
        },
      ];
    case "bbs": {
      const cats = bbsCategories.value;
      const cur = String(route.query.cat ?? "");
      const links: SideLink[] = [
        {
          to: { name: "bbs" },
          label: "All boards",
          desc: boardsLoaded.value
            ? `${boardCount.value} boards`
            : "Bulletin boards",
          icon: "☰",
        },
      ];
      for (const cat of cats) {
        links.push({
          to: {
            name: "bbs",
            query: cur === cat ? {} : { cat },
          },
          label: cat,
          desc: "Category",
          icon: "#",
          match: { section: cat },
        });
      }
      return links;
    }
    case "db":
      return [
        {
          to: { name: "db" },
          label: "All objects",
          desc: "Full browser",
          icon: "▣",
        },
        {
          to: { name: "db", query: { filter: "player" } },
          label: "Players",
          desc: objectsLoaded.value
            ? `${playerCount.value} in DB`
            : "Character objects",
          icon: "◎",
        },
        {
          to: { name: "db", query: { filter: "room" } },
          label: "Rooms",
          desc: "Locations",
          icon: "⌂",
        },
        {
          to: { name: "db", query: { filter: "exit" } },
          label: "Exits",
          desc: "Links",
          icon: "↗",
        },
        {
          to: { name: "db", query: { filter: "thing" } },
          label: "Things",
          desc: "Other objects",
          icon: "·",
        },
      ];
    case "settings":
      return [
        {
          to: { name: "settings" },
          label: "Game & layout",
          desc: "Name, start, chrome",
          icon: "⚙",
        },
        {
          to: { name: "settings", query: { tab: "plugins" } },
          label: "Plugins",
          desc: "Loaded + JSON files",
          icon: "⧉",
        },
        {
          to: { name: "settings", query: { tab: "restart" } },
          label: "Restart",
          desc: "Soft-reboot main",
          icon: "↻",
        },
      ];
    default:
      return [
        {
          to: { name: "players", query: { filter: "online" } },
          label: "Online",
          desc: onlineLoaded.value
            ? `${onlineCount.value} now`
            : "Who’s connected",
          icon: "●",
        },
        {
          to: { name: "jobs", query: { filter: "new" } },
          label: "New jobs",
          desc: jobsLoaded.value
            ? `${jobsNew.value} waiting`
            : "Untriaged",
          icon: "!",
        },
        {
          to: { name: "wiki", query: { filter: "drafts" } },
          label: "Drafts",
          desc: pagesLoaded.value
            ? `${wikiDrafts.value} pages`
            : "Wiki drafts",
          icon: "◇",
        },
        {
          to: { name: "wiki-new" },
          label: "New page",
          desc: "Wiki entry",
          icon: "+",
        },
      ];
  }
});

const liveHint = computed(() => {
  if (!wsConnected.value) {
    return mode.value === "connecting" ? "connecting…" : "offline";
  }
  if (refreshing.value) return "syncing…";
  if (!lastUpdated.value) return "live";
  const sec = Math.max(
    0,
    Math.floor((nowTick.value - lastUpdated.value) / 1000),
  );
  if (sec < 2) return "live · just now";
  if (sec < 60) return `live · ${sec}s ago`;
  return `live · ${Math.floor(sec / 60)}m ago`;
});

function isPrimaryActive(id: string): boolean {
  return section.value === id;
}

function routeInSection(target: string, name: string): boolean {
  if (name === target) return true;
  if (target === "wiki" && name === "wiki-edit") return true;
  if (target === "jobs" && name === "job-detail") return true;
  if (target === "players" && name === "player-detail") return true;
  if (target === "bbs" &&
    (name === "bbs-board" || name === "bbs-post")) {
    return true;
  }
  if (target === "db" && name === "db-detail") return true;
  if (target === "settings" && name === "settings") return true;
  return false;
}

function isSideActive(link: SideLink): boolean {
  const name = String(route.name ?? "");
  const target = link.to.name;
  if (target === "wiki-new") return name === "wiki-new";
  if (!routeInSection(target, name)) return false;

  const haveFilter = String(route.query.filter ?? "");
  const haveTag = String(route.query.tag ?? "");
  const haveSection = String(route.query.section ?? "");
  const haveCat = String(route.query.cat ?? "");

  if (link.match) {
    // BBS category links stash cat in match.section
    if (target === "bbs" && link.match.section) {
      return haveCat === link.match.section;
    }
    return (
      (link.match.filter ?? "") === haveFilter &&
      (link.match.tag ?? "") === haveTag &&
      (link.match.section ?? "") === haveSection
    );
  }

  const lq = link.to.query ?? {};
  const wantFilter = lq.filter ?? "";
  const wantTag = lq.tag ?? "";
  const wantSection = lq.section ?? "";

  if (target === "wiki" || target === "wiki-edit") {
    return (
      wantFilter === haveFilter &&
      wantTag === haveTag &&
      wantSection === haveSection
    );
  }

  // Settings tabs use ?tab=
  if (target === "settings") {
    const wantTab = lq.tab ?? "";
    const haveTab = String(route.query.tab ?? "");
    return wantTab === haveTab;
  }

  // BBS category filter uses ?cat=
  if (target === "bbs") {
    const wantCat = lq.cat ?? "";
    return wantCat === haveCat;
  }

  if (lq.filter) return haveFilter === lq.filter;
  return haveFilter === "";
}

// Clear topbar chips when the operator opens that section.
watch(
  section,
  (sec) => {
    ackSectionBadges(sec);
  },
  { immediate: true },
);

// Re-ack if counts settle after snapshot while still on the tab
// (so a late "3" does not flash after we already opened Boards).
watch(
  [
    staffBadges,
    boardFlaggedTotal,
    jobsOpen,
    wikiDrafts,
    onlineCount,
    boardsLoaded,
    jobsLoaded,
    pagesLoaded,
    onlineLoaded,
  ],
  () => {
    ackSectionBadges(section.value);
  },
);

onMounted(() => {
  if (!wsConnected.value) live.startPolling();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});

function signOut(): void {
  session.signOut();
  void router.replace({ name: "login" });
}
</script>

<template>
  <div id="view-app">
    <header class="topbar container-fluid">
      <nav
        class="top-nav"
        aria-label="Staff console"
      >
        <div class="top-nav-left">
          <RouterLink
            class="brand"
            :to="{ name: 'dashboard' }"
          >
            UrsaMU
          </RouterLink>
          <span
            class="top-divider"
            aria-hidden="true"
          />
          <ul class="top-primary">
            <li
              v-for="item in primary"
              :key="item.id"
            >
              <a
                v-if="item.href && !item.name"
                class="top-tab"
                :href="item.href"
              >
                <span class="top-tab-label">{{ item.label }}</span>
                <span
                  v-if="item.badge"
                  class="top-badge"
                  :title="item.badgeTitle"
                >{{ item.badge }}</span>
              </a>
              <RouterLink
                v-else-if="item.name"
                class="top-tab"
                :class="{ active: isPrimaryActive(item.id) }"
                :to="{ name: item.name }"
              >
                <span class="top-tab-label">{{ item.label }}</span>
                <span
                  v-if="item.badge"
                  class="top-badge"
                  :title="item.badgeTitle"
                >{{ item.badge }}</span>
              </RouterLink>
            </li>
          </ul>
        </div>

        <div class="top-nav-right">
          <span
            class="top-live"
            :title="wsConnected
              ? 'Admin WebSocket'
              : 'WebSocket disconnected'"
          >
            <span
              class="poll-dot"
              :class="{
                stale: !wsConnected,
                spin: refreshing || mode === 'connecting',
                ws: wsConnected,
              }"
            />
            {{ liveHint }}
          </span>
          <span
            class="top-divider top-divider-sm"
            aria-hidden="true"
          />
          <span class="top-user muted">{{
            session.displayName
          }}</span>
          <button
            type="button"
            class="outline secondary top-signout"
            @click="signOut"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>

    <div class="shell container-fluid">
      <aside
        class="side-nav"
        :aria-label="`${sectionTitle} menu`"
      >
        <p class="side-nav-label">
          {{ sectionTitle }}
        </p>
        <nav
          class="side-nav-list"
          aria-label="Section shortcuts"
        >
          <RouterLink
            v-for="(link, i) in sideLinks"
            :key="'s-' + i"
            class="side-nav-item"
            :class="{ 'is-active': isSideActive(link) }"
            :to="link.to"
          >
            <span
              class="side-nav-icon"
              aria-hidden="true"
            >{{ link.icon || "·" }}</span>
            <span class="side-nav-text">
              <span class="side-nav-title">{{ link.label }}</span>
              <span
                v-if="link.desc"
                class="side-nav-desc"
              >{{ link.desc }}</span>
            </span>
          </RouterLink>
        </nav>

        <template v-if="section === 'wiki'">
          <hr class="side-nav-hr">
          <p class="side-nav-label">
            Tags
          </p>
          <nav
            class="side-nav-list side-nav-list-compact"
            aria-label="Wiki tags"
          >
            <p
              v-if="!wikiTagLinks.length"
              class="side-nav-empty muted"
            >
              No tags yet.
            </p>
            <RouterLink
              v-for="(link, i) in wikiTagLinks"
              :key="'t-' + link.label + i"
              class="side-nav-item side-nav-item-compact"
              :class="{ 'is-active': isSideActive(link) }"
              :to="link.to"
            >
              <span
                class="side-nav-icon"
                aria-hidden="true"
              >#</span>
              <span class="side-nav-text">
                <span class="side-nav-title">{{
                  link.label
                }}</span>
                <span class="side-nav-desc">{{
                  link.desc
                }}</span>
              </span>
            </RouterLink>
          </nav>

          <hr class="side-nav-hr">
          <p class="side-nav-label">
            Sections
          </p>
          <nav
            class="side-nav-list side-nav-list-compact"
            aria-label="Wiki sections"
          >
            <p
              v-if="!wikiSectionLinks.length"
              class="side-nav-empty muted"
            >
              No sections yet.
            </p>
            <RouterLink
              v-for="(link, i) in wikiSectionLinks"
              :key="'sec-' + link.label + i"
              class="side-nav-item side-nav-item-compact"
              :class="{ 'is-active': isSideActive(link) }"
              :to="link.to"
            >
              <span
                class="side-nav-icon"
                aria-hidden="true"
              >/</span>
              <span class="side-nav-text">
                <span class="side-nav-title">{{
                  link.label
                }}</span>
                <span class="side-nav-desc">{{
                  link.desc
                }}</span>
              </span>
            </RouterLink>
          </nav>
        </template>

        <div class="side-nav-foot">
          <p class="muted side-nav-hint">
            <span
              class="poll-dot"
              :class="{
                stale: !wsConnected,
                spin: refreshing || mode === 'connecting',
                ws: wsConnected,
              }"
            />
            {{ liveHint }}
          </p>
        </div>
      </aside>

      <main
        id="main-pane"
        class="main-pane"
        tabindex="-1"
      >
        <RouterView v-slot="{ Component }">
          <Transition
            name="fade"
            mode="out-in"
          >
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
