+notes  -- Character notes with public/private visibility.

SYNTAX
  +notes                                Show your own notes.
  +notes <player>                       Show another's visible notes.
  +notes <player>/<name>                Show one note in full.
  +notes/add [<player>/]<name>=<text>   Create (public by default).
  +notes/edit [<player>/]<name>=<text>  Replace text.
  +notes/del [<player>/]<name>          Delete a note.
  +notes/priv [<player>/]<name>=<vis>   public | private.

Public notes visible to anyone who sees the character. Private notes
only owner + staff (admin+). Editing others = builder+.

LIMITS  Name up to 40 chars; Text up to 8000. Name is slug-normalized.

EXAMPLES
  +notes/add Backstory=I was born in a small town...
  +notes/priv Backstory=private

SEE ALSO: help sheet, help finger, help cg
