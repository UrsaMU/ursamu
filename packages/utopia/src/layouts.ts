import type {
  IChar,
  ICity,
  ISphereNpc,
  RulingResult,
} from "./types.ts";

export interface ILayout {
  components: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  text: string;
}

function storiesOf(city: ICity) {
  return [city.tension, ...city.stories];
}

export function feedLayout(city: ICity): ILayout {
  const stories = storiesOf(city).map((s) => ({
    title: s.title,
    severity: s.severity,
  }));
  const lines = [
    `${city.name}  Wk ${city.week}`,
    ...stories.map((s) =>
      `  sev ${s.severity}  ${s.title}`
    ),
  ];
  return {
    meta: {
      type: "utopia-feed",
      city: city.name,
      week: city.week,
      stories,
    },
    components: [
      { type: "header", title: `Week ${city.week} — ${city.name}` },
      {
        type: "actions",
        title: "Stories",
        items: stories.map((s) => ({
          label: s.title,
          badge: String(s.severity),
          action: { cmd: `+week/plan ${s.title}` },
        })),
      },
    ],
    text: lines.join("\r\n"),
  };
}

export function weekLayout(
  city: ICity,
  crew: IChar[],
): ILayout {
  const items = crew.map((c) => ({
    label: c.name,
    meta: c.ready ? "ready" : "wait",
    sublabel: c.plan || "(no plan)",
    action: { cmd: "+week/ready" },
  }));
  const plans = crew
    .map((c) => `${c.name}: ${c.plan || "(none)"}`)
    .join("\r\n");
  return {
    meta: { type: "utopia-week", week: city.week },
    components: [
      { type: "header", title: `This week — ${city.name}` },
      { type: "entity-list", title: "Crew", items },
      { type: "text", content: plans },
    ],
    text: `Week ${city.week}\r\n${plans}`,
  };
}

export function rulingLayout(opts: {
  result: RulingResult | "revised";
  prose: string;
  danger: string;
  dv: number;
}): ILayout {
  const face = opts.result.toUpperCase();
  return {
    meta: { type: "utopia-ruling", result: opts.result },
    components: [
      { type: "header", title: face },
      { type: "text", content: opts.prose },
      {
        type: "table",
        content: [
          ["Danger", opts.danger],
          ["DV", String(opts.dv)],
        ],
      },
    ],
    text: `${face}\r\n${opts.prose}\r\nDanger ${opts.danger}  DV ${opts.dv}`,
  };
}

export function sphereLayout(
  ch: IChar,
  npcs: ISphereNpc[],
): ILayout {
  const items = npcs.map((n) => ({
    label: n.name,
    meta: String(n.rep),
    sublabel: n.job,
    action: { cmd: `+sphere ${n.name}` },
  }));
  const lines = npcs.map((n) =>
    `${n.name}  ${n.rep >= 0 ? "+" : ""}${n.rep}  ${n.job}`
  );
  lines.push(`Bills ${ch.lifestyle}  Resources ${ch.resources}`);
  return {
    meta: { type: "utopia-sphere" },
    components: [
      { type: "header", title: "Sphere" },
      { type: "entity-list", title: "People", items },
      {
        type: "table",
        content: [
          ["Resources", String(ch.resources)],
          ["Lifestyle", String(ch.lifestyle)],
        ],
      },
    ],
    text: lines.join("\r\n"),
  };
}

export function youLayout(ch: IChar): ILayout {
  const rows: [string, string][] = [
    ["Danger", String(ch.danger)],
    ["Resources", String(ch.resources)],
    ["Bravado", String(ch.bravado)],
    ["Plan", ch.plan || "(none)"],
    ["Goals", ch.goals.join("; ") || "(none)"],
  ];
  return {
    meta: { type: "utopia-you" },
    components: [
      { type: "header", title: ch.name },
      { type: "table", content: rows },
      {
        type: "actions",
        items: [
          { label: "Week", action: { cmd: "+week" } },
          { label: "Feed", action: { cmd: "+feed" } },
        ],
      },
    ],
    text: rows.map((r) => `${r[0]}: ${r[1]}`).join("\r\n"),
  };
}
