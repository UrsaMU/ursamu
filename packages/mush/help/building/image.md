+IMAGE

Set or clear a **local** image on a room, thing, or player.
Fetched URLs are stored on the server under `/images/`.

SYNTAX
  @image <object>=<url>
  @image <object>=clear

NOTES
  PNG, JPEG, GIF, WebP. Max 2 MB.
  Web look shows the image above the description.
  Staff can also upload in Admin → Database.

EXAMPLES
  @image here=https://example.com/room.png
  @image me=https://example.com/me.jpg
  @image #12=clear

SEE ALSO: @avatar, look
