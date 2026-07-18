---
dark: true
---
See also: +help mail (overview)

+MAIL/REST

Authenticated REST surface under `/api/v1/mail`.

ENDPOINTS
  GET    /api/v1/mail           Inbox (`?folder=trash`)
  GET    /api/v1/mail/sent      Messages you sent
  GET    /api/v1/mail/:id       Read (marks read)
  POST   /api/v1/mail           Send immediately
  PATCH  /api/v1/mail/:id       `folder` / `starred`
  DELETE /api/v1/mail/:id       Trash or hard-delete

CONFIG
  plugins.mail.db   Collection name (default
                    `mail.messages`)

SEE ALSO: +help mail
