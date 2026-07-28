/**
 * Form-letter templates for approve/deny/complete (close-out letters).
 * Config: plugins.jobs.letters — no hard bbs dependency.
 */
import { getConfig } from "@ursamu/mush";
import type { IJob } from "./types.ts";
import { sendJobMail } from "./mail.ts";

export interface ILetterTpl {
  mail?: string;
  bbsBoard?: string | number;
  bbsBody?: string;
}

export interface ILettersConfig {
  complete?: ILetterTpl;
  approve?: ILetterTpl;
  deny?: ILetterTpl;
  add?: ILetterTpl;
}

export function getLettersConfig(): ILettersConfig {
  return getConfig<ILettersConfig>("plugins.jobs.letters", {}) ??
    {};
}

export function expandLetter(
  tpl: string,
  ctx: {
    job: IJob;
    staff: string;
    comment?: string;
  },
): string {
  const j = ctx.job;
  return tpl
    .replace(/%n/g, String(j.number))
    .replace(/%t/g, j.title)
    .replace(/%r/g, j.submitterName)
    .replace(/%s/g, ctx.staff)
    .replace(/%b/g, j.bucket || j.category || "")
    .replace(/%c/g, ctx.comment ?? "");
}

export async function applyCloseLetters(
  mode: "complete" | "approve" | "deny",
  job: IJob,
  staff: string,
  comment: string,
  fromId: string,
): Promise<void> {
  const cfg = getLettersConfig();
  const tpl = cfg[mode];
  if (!tpl?.mail) return;
  const body = expandLetter(tpl.mail, { job, staff, comment });
  const subj = expandLetter(
    `Job #%n ${mode}: %t`,
    { job, staff, comment },
  );
  await sendJobMail(fromId, job.submittedBy, subj, body);
}
