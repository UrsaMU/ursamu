# UrsaMU FE Starter Theme

Installable **colored** public FE theme (violet night tokens + SVG art).

Same tooling as [web-template](https://github.com/UrsaMU/web-template)
(the greyscale wireframe):

| Task | Command |
|------|---------|
| Preview | `deno task preview:open` |
| Theme Studio | `deno task studio` |
| Pack zip | `deno task pack` |

```bash
cp -R . ../my-theme
cd ../my-theme
# edit theme.json id/label/title + site.css
deno task studio
deno task pack
```

Upload the zip in **Admin → Settings → Public site**.

Wireframe-only start: use **web-template** / `examples/themes/skeleton`.
Visual editor: https://github.com/UrsaMU/theme-studio
