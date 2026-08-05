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
import {
  ensurePluginModules,
  ensureStaffRouteStubs,
  navTargetReady,
  resolveNavTarget,
  staffRoutesEpoch,
} from "@/plugin-modules";

const session = useSessionStore();
const live = useLiveStore();
const {
  refreshing,
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
  staffSideNav,
  staffBadges,
  mode,
  wsConnected,
} = storeToRefs(live);
const router = useRouter();
const route = useRoute();

// Dynamic modules + stub routes for route-only staffNav entries
// (mail/channels/help register route names the host must own).
watch(
  staffNav,
  (nav) => {
    ensureStaffRouteStubs(router, nav);
    void ensurePluginModules(router, nav);
  },
  { immediate: true, deep: true },
);

/** Off-canvas nav drawer (primary + section links on small screens). */
const navOpen = ref(false);

function closeNav(): void {
  navOpen.value = false;
}

function toggleNav(): void {
  navOpen.value = !navOpen.value;
}

function onNavKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && navOpen.value) {
    e.preventDefault();
    closeNav();
  }
}

/** Hide broken avatar img; show initial instead. */
const avatarBroken = ref(false);
function onAvatarError(): void {
  avatarBroken.value = true;
}

watch(
  () => session.me?.avatar,
  () => {
    avatarBroken.value = false;
  },
);

type Section = string;

const section = computed<Section>(() => {
  const n = String(route.name ?? "");
  if (n === "plugin-embed") {
    return String(route.params.pluginId ?? "").trim() || "plugin";
  }
  if (n === "dashboard" || n === "") return "dashboard";
  if (n.startsWith("wiki")) return "wiki";
  if (n.startsWith("job")) return "jobs";
  if (n.startsWith("bbs")) return "bbs";
  if (n === "mail" || n.startsWith("mail")) return "mail";
  if (n === "channels" || n.startsWith("channels")) {
    return "channels";
  }
  if (n === "help" || n.startsWith("help")) return "help";
  if (n.startsWith("db") || n.startsWith("player")) return "db";
  if (n === "map" || n.startsWith("map")) return "map";
  if (n === "settings") return "settings";
  // Plugin-registered host routes (mail, channels, help, …)
  const byRoute = staffNav.value.find(
    (p) => p.route === n || p.id === n,
  );
  if (byRoute) return byRoute.id;
  const metaId = route.meta?.pluginId;
  if (typeof metaId === "string" && metaId.trim()) {
    return metaId.trim();
  }
  return "dashboard";
});

/** Plugin-contributed section titles win over host hardcodes. */
const sectionTitle = computed(() => {
  const plug = staffNav.value.find((p) => p.id === section.value);
  if (plug?.label) return plug.label;
  switch (section.value) {
    case "dashboard":
      return "Dashboard";
    case "wiki":
      return "Wiki";
    case "jobs":
      return "Jobs";
    case "db":
      return "Database";
    case "map":
      return "Map";
    case "settings":
      return "Settings";
    case "bbs":
      return "Boards";
    default:
      return plug?.label || "Menu";
  }
});

type PrimaryItem = {
  id: string;
  name?: string;
  /** Full router location when name alone is not enough (embed). */
  to?: { name: string; params?: Record<string, string> };
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
    case "players:online": {
      // Don't notify for "only me" — ambient presence, not news
      const meId = String(session.me?.id ?? "").trim();
      const others = live.online.filter((p) => {
        const id = String(p.id ?? "").trim();
        return id && id !== meId;
      }).length;
      return {
        badge: onlineLoaded.value && others > 0
          ? String(others)
          : "",
        badgeTitle: "Other players online",
      };
    }
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
    // Players folded into Database — ack when opening DB
    db: "players:online",
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
  { id: "db", name: "db", label: "Database", order: 60 },
  { id: "settings", name: "settings", label: "Settings", order: 90 },
];

const primary = computed((): PrimaryItem[] => {
  // Depend on epoch so tabs refresh after stub/module routes land.
  void staffRoutesEpoch.value;
  const hasRoute = (n: string) => router.hasRoute(n);

  const core: PrimaryItem[] = CORE_PRIMARY.map((c) => {
    let badge = "";
    let badgeTitle: string | undefined;
    // Online players badge on Database (Players section removed)
    if (c.id === "db") {
      ({ badge, badgeTitle } = badgeForKey("players:online"));
    }
    return { ...c, badge, badgeTitle };
  });

  const pluginIds = new Set(
    staffNav.value.map((p) => p.id),
  );
  // Drop core slots only if a plugin re-uses the same id.
  const base = core.filter((c) => !pluginIds.has(c.id));

  const plugins: PrimaryItem[] = [];
  for (const p of staffNav.value) {
    const b = badgeForKey(p.badgeKey);
    const target = resolveNavTarget(p, hasRoute);
    // Never emit a tab that RouterLink cannot resolve — empty LI.
    if (!navTargetReady(target, hasRoute)) continue;

    if (target.to) {
      plugins.push({
        id: p.id,
        label: p.label,
        name: target.to.name,
        to: target.to,
        order: p.order ?? 100,
        badge: b.badge,
        badgeTitle: p.badgeTitle || b.badgeTitle,
      });
      continue;
    }
    if (target.name) {
      plugins.push({
        id: p.id,
        label: p.label,
        name: target.name,
        order: p.order ?? 100,
        badge: b.badge,
        badgeTitle: p.badgeTitle || b.badgeTitle,
      });
      continue;
    }
    plugins.push({
      id: p.id,
      label: p.label,
      href: target.href || p.href,
      order: p.order ?? 100,
      badge: b.badge,
      badgeTitle: p.badgeTitle || b.badgeTitle,
    });
  }

  return [...base, ...plugins].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
});

type SideLink = {
  /** Group header row (not a link) */
  header?: boolean;
  to?: {
    name: string;
    params?: Record<string, string>;
    query?: Record<string, string>;
  };
  label: string;
  desc?: string;
  icon?: string;
  /** Explicit highlight (for toggle links whose `to` clears the value). */
  match?: {
    filter?: string;
    tag?: string;
    section?: string;
    /** Embed plugin side-nav item id */
    sideId?: string;
  };
};

/** Plugin registerStaffSideNav → host side entries for this section. */
function pluginSideLinks(pageId: string): SideLink[] | null {
  const reg = staffSideNav.value[pageId];
  if (!reg?.groups?.length) return null;
  const nav = staffNav.value.find((p) => p.id === pageId);
  const isEmbed = Boolean(nav?.embed?.trim()) ||
    nav?.route === "plugin-embed";
  const hostRoute = nav?.route?.trim();
  const links: SideLink[] = [];
  let multi = reg.groups.length > 1 ||
    reg.groups.some((g) => Boolean(g.title?.trim()));

  for (const g of reg.groups) {
    if (multi && g.title?.trim()) {
      links.push({
        header: true,
        label: g.title.trim(),
      });
    }
    for (const it of g.items) {
      const query = it.query ? { ...it.query } : undefined;
      if (isEmbed) {
        links.push({
          to: {
            name: "plugin-embed",
            params: { pluginId: pageId },
            query,
          },
          label: it.label,
          desc: it.desc,
          icon: it.icon || "·",
          match: { sideId: it.id },
        });
      } else if (hostRoute && hostRoute !== "plugin-embed") {
        links.push({
          to: { name: hostRoute, query },
          label: it.label,
          desc: it.desc,
          icon: it.icon || "·",
          match: { sideId: it.id, ...query },
        });
      }
    }
  }
  return links.length ? links : null;
}

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

/** Open Tags/Sections dropdown when a filter from that group is active. */
const wikiTagsOpen = computed(() => Boolean(activeWikiTag.value));
const wikiSectionsOpen = computed(() =>
  Boolean(activeWikiSection.value),
);

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

const helpSourceLinks = computed((): SideLink[] => {
  const sec = typeof route.query.section === "string"
    ? route.query.section
    : "";
  const src = typeof route.query.source === "string"
    ? route.query.source
    : "";
  const q = (source?: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (source) out.source = source;
    if (sec) out.section = sec;
    return out;
  };
  return [
    {
      to: { name: "help", query: q() },
      label: "All topics",
      desc: "Browse & filter",
      icon: "¶",
      match: { filter: "" },
    },
    {
      to: {
        name: "help",
        query: q(src === "file" ? "" : "file"),
      },
      label: "File",
      desc: "help/*.md packages",
      icon: "◇",
      match: { filter: "file" },
    },
    {
      to: {
        name: "help",
        query: q(src === "command" ? "" : "command"),
      },
      label: "Command",
      desc: "Inline addCmd help",
      icon: "⌘",
      match: { filter: "command" },
    },
    {
      to: {
        name: "help",
        query: q(src === "database" ? "" : "database"),
      },
      label: "Overrides",
      desc: "Database edits",
      icon: "✓",
      match: { filter: "database" },
    },
    {
      to: { name: "help", query: { new: "1" } },
      label: "New override",
      desc: "Create DB topic",
      icon: "+",
    },
  ];
});

const sideLinks = computed((): SideLink[] => {
  // Plugin-owned side nav wins for that section (embed or host route)
  const fromPlugin = pluginSideLinks(section.value);
  if (fromPlugin) return fromPlugin;

  switch (section.value) {
    case "wiki":
      return wikiStatusLinks.value;
    case "help":
      return helpSourceLinks.value;
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
      // Categories only — never promote board groups to look like
      // top-level app sections (Mail / Channels / …).
      if (cats.length) {
        links.push({
          header: true,
          label: "Board categories",
        });
      }
      for (const cat of cats) {
        links.push({
          to: {
            name: "bbs",
            query: cur === cat ? {} : { cat },
          },
          label: cat,
          desc: "Filter boards",
          icon: "▸",
          match: { section: cat },
        });
      }
      return links;
    }
    case "map":
      return [
        {
          to: { name: "map", query: {} },
          label: "On the map",
          desc: "Live vehicles",
          icon: "◎",
        },
        {
          to: { name: "map", query: { tool: "look" } },
          label: "Looking at",
          desc: "Sector view",
          icon: "◉",
        },
        {
          to: { name: "map", query: { tool: "legend" } },
          label: "Legend",
          desc: "Biomes & Perlin bands",
          icon: "≡",
        },
        {
          to: { name: "map", query: { tool: "mark" } },
          label: "Mark a tile",
          desc: "Place / clear",
          icon: "#",
        },
        {
          to: { name: "map", query: { tool: "cleanup" } },
          label: "Cleanup",
          desc: "Orphans & stranded",
          icon: "⌫",
        },
      ];
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
            ? `${playerCount.value} accounts`
            : "Characters",
          icon: "◎",
        },
        {
          to: { name: "db", query: { filter: "online" } },
          label: "Online",
          desc: onlineLoaded.value
            ? `${onlineCount.value} connected`
            : "Connected now",
          icon: "●",
        },
        {
          to: { name: "db", query: { filter: "offline" } },
          label: "Offline",
          desc: "Not connected",
          icon: "○",
        },
        {
          to: { name: "db", query: { filter: "staff" } },
          label: "Staff",
          desc: "Admin & wizard",
          icon: "★",
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
          to: { name: "settings", query: { tab: "site" } },
          label: "Public site",
          desc: "Skin, banner, nav",
          icon: "◈",
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
          to: { name: "db", query: { filter: "online" } },
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
    return mode.value === "connecting" ? "Connecting" : "Offline";
  }
  if (refreshing.value) return "Syncing";
  return "Live";
});

function isPrimaryActive(id: string): boolean {
  return section.value === id;
}

function routeInSection(target: string, name: string): boolean {
  if (name === target) return true;
  if (target === "wiki" && name === "wiki-edit") return true;
  if (target === "jobs" && name === "job-detail") return true;
  if (target === "bbs" &&
    (name === "bbs-board" || name === "bbs-post")) {
    return true;
  }
  if (target === "help" && name === "help-detail") return true;
  if (target === "mail" && name === "mail-detail") return true;
  if (
    target === "channels" && name === "channels-detail"
  ) {
    return true;
  }
  if (target === "db" && name === "db-detail") return true;
  if (target === "settings" && name === "settings") return true;
  return false;
}

function isSideActive(link: SideLink): boolean {
  if (link.header || !link.to) return false;
  const name = String(route.name ?? "");
  const target = link.to.name;
  if (target === "wiki-new") return name === "wiki-new";

  // Plugin embed side-nav: match query keys on /admin/ext/:id
  if (target === "plugin-embed") {
    if (name !== "plugin-embed") return false;
    const wantId = String(link.to.params?.pluginId ?? "");
    const haveId = String(route.params.pluginId ?? "");
    if (wantId && wantId !== haveId) return false;
    const lq = link.to.query ?? {};
    const keys = Object.keys(lq);
    if (!keys.length) {
      // "root" item: active when no extra query (or only empty)
      return Object.keys(route.query).length === 0;
    }
    return keys.every(
      (k) => String(route.query[k] ?? "") === String(lq[k] ?? ""),
    );
  }

  if (!routeInSection(target, name)) return false;

  const haveFilter = String(route.query.filter ?? "");
  const haveTag = String(route.query.tag ?? "");
  const haveSection = String(route.query.section ?? "");
  const haveCat = String(route.query.cat ?? "");
  const haveSource = String(route.query.source ?? "");

  if (link.match) {
    // BBS category links stash cat in match.section
    if (target === "bbs" && link.match.section) {
      return haveCat === link.match.section;
    }
    // Help source filters reuse match.filter for source=
    if (target === "help" && link.match.filter !== undefined) {
      return haveSource === (link.match.filter ?? "");
    }
    if (link.match.sideId && link.to.query) {
      const lq = link.to.query;
      return Object.keys(lq).every(
        (k) => String(route.query[k] ?? "") === String(lq[k] ?? ""),
      );
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

  // Map tools use ?tool=
  if (target === "map") {
    const wantTool = String(lq.tool ?? "");
    const haveTool = String(route.query.tool ?? "");
    return wantTool === haveTool;
  }

  if (lq.filter) return haveFilter === lq.filter;
  return haveFilter === "";
}

// Close drawer on navigation (do not scroll the top tab strip —
// that hid other section buttons until a mid tab was clicked).
watch(
  () => route.fullPath,
  () => {
    closeNav();
  },
);

// Scope badge "seen" state to this staff account (localStorage)
watch(
  () => session.me?.id,
  (id) => {
    live.loadBadgeAcksForUser(id ?? null);
  },
  { immediate: true },
);

watch(
  section,
  (sec) => {
    ackSectionBadges(sec);
  },
  { immediate: true },
);

watch(navOpen, (open) => {
  document.body.classList.toggle("nav-drawer-open", open);
});

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
  window.addEventListener("keydown", onNavKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onNavKeydown);
  document.body.classList.remove("nav-drawer-open");
});

function signOut(): void {
  session.signOut();
  void router.replace({ name: "login" });
}

/** Compact icons for drawer primary nav (mobile). */
function primaryIcon(id: string): string {
  switch (id) {
    case "dashboard":
      return "⌂";
    case "wiki":
      return "¶";
    case "players":
      return "◎";
    case "jobs":
      return "!";
    case "bbs":
      return "#";
    case "map":
      return "▣";
    case "db":
      return "▤";
    case "settings":
      return "⚙";
    case "channels":
      return "☰";
    case "mail":
      return "✉";
    case "help":
      return "?";
    default:
      return "·";
  }
}
</script>

<template>
  <div
    id="view-app"
    :class="{ 'is-nav-open': navOpen }"
  >
    <a
      class="skip-link"
      href="#main-pane"
    >Skip to main content</a>

    <header class="topbar container-fluid">
      <nav
        class="top-nav"
        aria-label="Staff console"
      >
        <div class="top-nav-left">
          <button
            type="button"
            class="nav-menu-btn"
            :aria-expanded="navOpen"
            aria-controls="staff-drawer"
            :aria-label="navOpen ? 'Close menu' : 'Open menu'"
            @click="toggleNav"
          >
            <span
              class="nav-menu-icon"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </span>
          </button>
          <RouterLink
            class="brand"
            :to="{ name: 'dashboard' }"
            @click="closeNav"
          >
            UrsaMU
          </RouterLink>
          <span
            class="top-section-chip"
            aria-hidden="true"
          >{{ sectionTitle }}</span>
          <span
            class="top-divider top-divider-desktop"
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
                :to="item.to ?? { name: item.name }"
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
            <span class="top-live-text">{{ liveHint }}</span>
          </span>
          <span
            class="top-divider top-divider-sm"
            aria-hidden="true"
          />
          <span class="top-user muted">
            <img
              v-if="session.me?.avatar && !avatarBroken"
              class="top-user-avatar"
              :src="session.me.avatar"
              alt=""
              referrerpolicy="no-referrer"
              @error="onAvatarError"
            >
            <span
              v-else
              class="top-user-avatar-initial"
              aria-hidden="true"
            >{{ session.displayName.charAt(0).toUpperCase() }}</span>
            <span class="top-user-name">{{
              session.displayName
            }}</span>
          </span>
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

    <div
      class="nav-backdrop"
      :class="{ 'is-visible': navOpen }"
      aria-hidden="true"
      @click="closeNav"
    />

    <div class="shell container-fluid">
      <aside
        id="staff-drawer"
        class="side-nav"
        :class="{ 'is-open': navOpen }"
        :aria-label="`${sectionTitle} menu`"
      >
        <div class="drawer-primary">
          <p class="side-nav-label">
            Sections
          </p>
          <nav
            class="side-nav-list"
            aria-label="Primary sections"
          >
            <template
              v-for="item in primary"
              :key="'d-' + item.id"
            >
              <a
                v-if="item.href && !item.name"
                class="side-nav-item"
                :class="{ 'is-active': isPrimaryActive(item.id) }"
                :href="item.href"
                @click="closeNav"
              >
                <span
                  class="side-nav-icon"
                  aria-hidden="true"
                >{{ primaryIcon(item.id) }}</span>
                <span class="side-nav-text">
                  <span class="side-nav-title">
                    {{ item.label }}
                    <span
                      v-if="item.badge"
                      class="top-badge drawer-badge"
                      :title="item.badgeTitle"
                    >{{ item.badge }}</span>
                  </span>
                </span>
              </a>
              <RouterLink
                v-else-if="item.name"
                class="side-nav-item"
                :class="{ 'is-active': isPrimaryActive(item.id) }"
                :to="item.to ?? { name: item.name }"
                @click="closeNav"
              >
                <span
                  class="side-nav-icon"
                  aria-hidden="true"
                >{{ primaryIcon(item.id) }}</span>
                <span class="side-nav-text">
                  <span class="side-nav-title">
                    {{ item.label }}
                    <span
                      v-if="item.badge"
                      class="top-badge drawer-badge"
                      :title="item.badgeTitle"
                    >{{ item.badge }}</span>
                  </span>
                </span>
              </RouterLink>
            </template>
          </nav>
          <hr class="side-nav-hr">
        </div>

        <p class="side-nav-label">
          {{ sectionTitle }}
        </p>
        <nav
          class="side-nav-list"
          aria-label="Section shortcuts"
        >
          <template
            v-for="(link, i) in sideLinks"
            :key="'s-' + i"
          >
            <p
              v-if="link.header"
              class="side-nav-label side-nav-group"
            >
              {{ link.label }}
            </p>
            <RouterLink
              v-else-if="link.to"
              class="side-nav-item"
              :class="{ 'is-active': isSideActive(link) }"
              :to="link.to"
              @click="closeNav"
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
          </template>
        </nav>

        <template v-if="section === 'wiki'">
          <hr class="side-nav-hr">
          <details
            class="side-nav-drop"
            v-bind="wikiTagsOpen ? { open: true } : {}"
          >
            <summary class="side-nav-drop-sum">
              <span class="side-nav-label side-nav-drop-label">
                Tags
              </span>
              <span
                class="side-nav-drop-count muted"
                aria-hidden="true"
              >{{ wikiTagLinks.length }}</span>
              <span
                class="side-nav-drop-chev"
                aria-hidden="true"
              />
            </summary>
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
                @click="closeNav"
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
          </details>

          <details
            class="side-nav-drop"
            v-bind="wikiSectionsOpen ? { open: true } : {}"
          >
            <summary class="side-nav-drop-sum">
              <span class="side-nav-label side-nav-drop-label">
                Sections
              </span>
              <span
                class="side-nav-drop-count muted"
                aria-hidden="true"
              >{{ wikiSectionLinks.length }}</span>
              <span
                class="side-nav-drop-chev"
                aria-hidden="true"
              />
            </summary>
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
                @click="closeNav"
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
          </details>
        </template>

        <div class="side-nav-foot">
          <button
            type="button"
            class="outline secondary drawer-signout"
            @click="signOut"
          >
            Sign out
          </button>
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
