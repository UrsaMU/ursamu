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
              headers: { "Authorization": `Bearer ${t}` }
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
              const found = attrs.find((at: any) => at.name.toLowerCase() === a.toLowerCase());
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
                  headers: { "Authorization": `Bearer ${token}` }
              });
              const current = await res.json();
              const currentAttrs = current.data?.attributes || [];
              
              // deno-lint-ignore no-explicit-any
              const idx = currentAttrs.findIndex((at: any) => at.name.toLowerCase() === attr.toLowerCase());
              if (idx >= 0) {
                  currentAttrs[idx].value = content;
              } else {
                  currentAttrs.push({ name: attr, value: content, setter: current.id }); // assuming self-set
              }
              
              payload = {
                  data: {
                      attributes: currentAttrs
                  }
              };
          }

          const res = await fetch(`http://localhost:4203/api/v1/dbobj/${dbref}`, {
              method: "PATCH",
              headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify(payload)
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
    <div class="h-screen flex flex-col bg-gray-900 text-gray-200">
        <header class="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
            <h1 class="text-lg font-mono">Editing: <span class="text-green-400">{dbref}/{attr}</span></h1>
            <div class="flex items-center gap-4">
                <span class="text-sm text-yellow-500">{status}</span>
                <button 
                  type="button"
                  onClick={handleSave} 
                  disabled={saving}
                  class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-white font-bold"
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </header>
        <div class="flex-1 overflow-hidden">
            <CodeEditor 
                initialValue={content} 
                onChange={setContent} 
                language={attr.toLowerCase().endsWith(".js") ? "javascript" : "markdown"} // Simple heuristic
            />
        </div>
    </div>
  );
}
