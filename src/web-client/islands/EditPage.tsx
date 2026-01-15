import { useEffect, useState } from "preact/hooks";
import CodeEditor from "./CodeEditor.tsx";

export default function EditPage() {
  const [token, setToken] = useState<string | null>(null);
  const [dbref, setDbref] = useState("");
  const [attr, setAttr] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    // Parse query params
    if (typeof globalThis.window !== "undefined") {
      const params = new URLSearchParams(globalThis.window.location.search);
      let t = params.get("token");
      const d = params.get("dbref");
      const a = params.get("attr");

      if (!t) {
        t = localStorage.getItem("ursamu_token");
      }

      if (t && d && a) {
        setToken(t);
        setDbref(d);
        setAttr(a);
        // Verify/Load?
        loadContent(t, d, a);
      } else {
        setStatus("Missing parameters (dbref, attr) or not logged in.");
        setLoading(false);
      }
    }
  }, []);

  const loadContent = async (t: string, d: string, a: string) => {
    try {
      // We don't have a direct 'get attribute' API yet in dbObjRouter.
      // We have GET /dbobj/:id -> returns whole object.
      // We can use that.
      const res = await fetch(`http://localhost:4203/api/v1/dbobj/${d}`, {
        headers: { "Authorization": `Bearer ${t}` },
      });

      if (!res.ok) throw new Error("Failed to load object");
      const data = await res.json();

      // Find attribute
      // data.data.attributes = [{name, value}, ...]
      // OR if it's a core property like 'description'
      if (a.toLowerCase() === "description") {
        setContent(data.description || "");
        // attrs is typed as any[] implicitly or list of objects
        const attrs = data.data?.attributes || [];
        // deno-lint-ignore no-explicit-any
        const found = attrs.find((at: any) =>
          at.name.toLowerCase() === a.toLowerCase()
        );
        setContent(found ? found.value : "");
      }
    } catch (e) {
      console.error(e);
      setStatus("Error loading content");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token || !dbref) return;
    setSaving(true);
    setStatus("Saving...");

    try {
      // Construct payload
      // deno-lint-ignore no-explicit-any
      let payload: any = {};

      if (attr.toLowerCase() === "description") {
        payload.description = content;
      } else {
        // We need to update the specific attribute.
        // dbObjRouter PATCH currently takes `data: { attributes: [...] }`
        // and merges. BUT it replaces the whole attribute list if we aren't careful?
        // Wait, dbObjRouter says: `targetObj.data = { ...targetObj.data, ...updates.data };`
        // If updates.data.attributes is provided, it OVERWRITES the array.
        // This is dangerous! We need to fetch, merge, and save.

        // Re-fetch to be safe (optimistic locking would be better but MVP)
        const res = await fetch(`http://localhost:4203/api/v1/dbobj/${dbref}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const current = await res.json();
        const currentAttrs = current.data?.attributes || [];

        // deno-lint-ignore no-explicit-any
        const idx = currentAttrs.findIndex((at: any) =>
          at.name.toLowerCase() === attr.toLowerCase()
        );
        if (idx >= 0) {
          currentAttrs[idx].value = content;
        } else {
          currentAttrs.push({ name: attr, value: content, setter: current.id }); // assuming self-set
        }

        payload = {
          data: {
            attributes: currentAttrs,
          },
        };
      }

      const res = await fetch(`http://localhost:4203/api/v1/dbobj/${dbref}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      console.error(e);
      setStatus("Error saving");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div class="text-white p-4">Loading editor...</div>;

  return (
    <div class="h-[80vh] flex flex-col bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl ring-1 ring-white/5 mx-4 md:mx-0">
      <header class="bg-black/20 p-4 border-b border-white/5 flex justify-between items-center backdrop-blur-md">
        <h1 class="text-sm font-mono uppercase tracking-wider text-slate-400">
          Editing: <span class="text-primary font-bold">{dbref}/{attr}</span>
        </h1>
        <div class="flex items-center gap-4">
          <span class="text-xs font-mono text-yellow-500 animate-pulse">
            {status}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            class="bg-white/10 hover:bg-primary hover:text-white border border-white/10 hover:border-primary px-6 py-2 rounded-full text-slate-300 font-bold transition-all duration-300 text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </header>
      <div class="flex-1 overflow-hidden relative">
        <CodeEditor
          initialValue={content}
          onChange={setContent}
          language={attr.toLowerCase().endsWith(".js")
            ? "javascript"
            : "markdown"}
        />
      </div>
    </div>
  );
}
