import { emitter, IMail, mail, Obj } from "../index.ts";

export const createMail = (
  sender: Obj,
  recipients: string[],
  subject: string,
  body: string,
) => {
  const m: IMail = {
    from: sender.dbref,
    to: recipients,
    subject,
    message: body,
    date: Date.now(),
  };

  mail.create(m);
  emitter.emit("mail", m);
  return m;
};
