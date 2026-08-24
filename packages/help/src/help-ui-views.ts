/**
 * Help section list + topic page (column chips + markdown).
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import type { HelpEntry } from "./registry.ts";
import {
  filterTopicsForViewer,
  isStaffOnlyEntry,
} from "./visibility.ts";
import {
  prefersWebUi,
  sendLayout,
  act,
  isStaff,
  topicChip,
  columnActions,
  parseSeeAlso,
} from "./help-ui.ts";

export function sendHelpSectionUi(
  u: IUrsamuSDK,
  section: string,
  entries: HelpEntry[],
): boolean {
  if (!prefersWebUi(u)) return false;
  const staff = isStaff(u);
  const list = filterTopicsForViewer(entries, staff)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const components: unknown[] = [
    {
      type: "header",
      title: `Help · ${section.toUpperCase()}`,
    },
  ];

  if (list.length) {
    components.push(columnActions(
      "Topics",
      list.map((e) => {
        // Prefer leaf name for nested paths
        const leaf = e.name.includes("/")
          ? e.name.split("/").pop() || e.name
          : e.name;
        return topicChip(
          leaf.toUpperCase(),
          `help ${e.name}`,
        );
      }),
      4,
    ));
  } else {
    components.push({
      type: "text",
      content: "No topics in this section.",
    });
  }

  components.push({
    type: "actions",
    columns: 1,
    items: [
      {
        id: "help-back",
        label: "All help",
        action: act("help"),
      },
    ],
  });

  sendLayout(u, components, "help-section");
  return true;
}

export function sendHelpTopicUi(
  u: IUrsamuSDK,
  entry: HelpEntry,
): boolean {
  if (!prefersWebUi(u)) return false;
  if (isStaffOnlyEntry(entry) && !isStaff(u)) {
    return false;
  }

  const raw = String(entry.content || "").trim();
  const { body: stripped, refs } = parseSeeAlso(raw);
  const body = stripped ||
    "_No detailed help available for this topic._";

  const components: unknown[] = [
    {
      type: "header",
      title: entry.name.toUpperCase(),
    },
    {
      type: "text",
      content:
        `%ch${entry.section}%cn` +
        (entry.tags?.length
          ? ` · ${entry.tags.join(", ")}`
          : ""),
    },
    { type: "markdown", content: body },
  ];

  if (refs.length) {
    components.push(columnActions(
      "See also",
      refs.map((r) =>
        topicChip(r.toUpperCase(), `help ${r}`)
      ),
      4,
    ));
  }

  components.push({
    type: "actions",
    columns: 2,
    items: [
      {
        id: "help-sec",
        label: entry.section.toUpperCase(),
        badge: "SEC",
        action: act(`help ${entry.section}`),
      },
      {
        id: "help-idx",
        label: "All help",
        badge: "IDX",
        action: act("help"),
      },
    ],
  });

  sendLayout(u, components, "help-topic");
  return true;
}
