// Player draft lives under state.mail (SDK) / data.mail (KV).
// hydrate() maps data → state, so both shapes are accepted here.

import type { IMail } from "./mailDbo.ts";
import type { IUrsamuSDK } from "@ursamu/mush";

export interface MailPlayerState {
  draft?: Partial<IMail>;
}

type StateBag = {
  state?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function bag(player: StateBag): Record<string, unknown> {
  if (player.state && typeof player.state === "object") {
    return player.state;
  }
  if (player.data && typeof player.data === "object") {
    return player.data;
  }
  return {};
}

export function getMailState(player: StateBag): MailPlayerState {
  const raw = bag(player).mail;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as MailPlayerState;
  }
  return {};
}

export function getDraft(
  player: StateBag,
): Partial<IMail> | undefined {
  return getMailState(player).draft;
}

export async function setDraft(
  u: IUrsamuSDK,
  draft: Partial<IMail> | undefined,
): Promise<void> {
  const prev = getMailState(u.me);
  if (draft === undefined) {
    const { draft: _d, ...rest } = prev;
    if (Object.keys(rest).length === 0) {
      await u.db.modify(u.me.id, "$unset", { "state.mail": "" });
    } else {
      await u.db.modify(u.me.id, "$set", { "state.mail": rest });
    }
    return;
  }
  await u.db.modify(u.me.id, "$set", {
    "state.mail": { ...prev, draft },
  });
}
