# Mail System Commands Index

- **`@mail [recipients] = [subject]`** - Initiates the mail composition process
  for specified recipients and subject.
- **`-[message]`** - Appends text to the body of the mail being composed.
- **`~[message]`** - Prepends text to the mail body.
- **`@mail/send`** - Finalizes and sends the composed mail to the specified
  recipients.
- **`@mail/quick [recipients]/[subject] = [message]`** - Quickly sends an email
  with specified recipients, subject, and message.
- **`@mail/proof`** - Displays the current state of the composed mail including
  recipients, subject, and draft.
- **`@mail/edit [old text] = [new text]`** - Edits a specific part of the mail's
  body.
- **`@mail/abort`** - Cancels and deletes the current mail draft.
- **`@mail/cc [recipients]`** - Adds additional recipients to the CC field of
  the mail.
- **`@mail/bcc [recipients]`** - Adds additional recipients to the BCC field of
  the mail.
- **`@mail/read [number]`** - Reads a specific mail from your inbox.
- **`@mail/delete [number]`** - Deletes a specific mail from your inbox.
- **`@mail/reply [number]`** - Replies to a specific mail in your inbox.
- **`@mail/replyall [number]`** - Replies to all original recipients of a
  specific mail.
- **`@mail/forward [number] = [recipient]`** - Forwards a specified mail to
  another recipient.
