import { useState, useEffect } from "preact/hooks";

interface IAttribute {
  name: string;
  value: string;
  setter: string;
}

interface IUserData {
  id: string;
  description?: string;
  data?: {
    name?: string;
    attributes?: IAttribute[];
    [key: string]: unknown;
  };
  flags: string;
}

export default function CharacterSheet() {
  const [token, setToken] = useState<string | null>(typeof localStorage !== "undefined" ? localStorage.getItem("ursamu_token") : null);
  const [user, setUser] = useState<IUserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit State
  const [desc, setDesc] = useState("");
  const [attrs, setAttrs] = useState<IAttribute[]>([]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const getCid = () => {
      if (!token) return "";
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id;
      } catch (e) {
        return "";
      }
  };

  const loadData = async () => {
    setLoading(true);
    const cid = getCid();
    if (!cid) return;

    try {
      const res = await fetch(`http://localhost:4203/api/v1/dbobj/${cid}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to load character data");
      const data: IUserData = await res.json();
      setUser(data);
      setDesc(data.description || "");
      setAttrs(data.data?.attributes || []);
    } catch (e) {
      console.error(e);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !token) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        description: desc,
        data: {
           attributes: attrs
        }
      };

      const res = await fetch(`http://localhost:4203/api/v1/dbobj/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error("Update failed");
      
      const updated = await res.json();
      setUser(updated);
      setSuccess("Character saved!");
    } catch (e) {
      console.error(e);
      setError("Failed to save character");
    } finally {
      setLoading(false);
    }
  };

  const updateAttr = (idx: number, field: keyof IAttribute, val: string) => {
    const newAttrs = [...attrs];
    newAttrs[idx] = { ...newAttrs[idx], [field]: val };
    setAttrs(newAttrs);
  };

  const addAttr = () => {
    setAttrs([...attrs, { name: "NEW_ATTR", value: "Value", setter: user?.id || "" }]);
  };

  const removeAttr = (idx: number) => {
      setAttrs(attrs.filter((_, i) => i !== idx));
  };

  if (!token) {
    return <div class="text-white p-4">Please login via the Game Client first.</div>;
  }

  if (loading && !user) return <div class="text-white p-4">Loading...</div>;

  return (
    <div class="max-w-4xl mx-auto bg-gray-800 p-6 rounded-lg shadow-xl text-gray-200 mt-8">
       <div class="flex justify-between items-center mb-6">
           <h2 class="text-2xl font-bold text-purple-400">Character Sheet: {user?.data?.name}</h2>
           <button onClick={loadData} class="text-sm text-gray-400 hover:text-white">Reload</button>
       </div>

       {error && <div class="bg-red-900/50 text-red-200 p-3 rounded mb-4">{error}</div>}
       {success && <div class="bg-green-900/50 text-green-200 p-3 rounded mb-4">{success}</div>}

       <div class="space-y-6">
           {/* Description */}
           <div>
               <label class="block text-sm font-bold text-gray-400 mb-2">Description</label>
               <textarea 
                  value={desc} 
                  onInput={(e) => setDesc(e.currentTarget.value)}
                  class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white h-32 focus:border-purple-500 focus:outline-none"
               />
           </div>

           {/* Attributes */}
           <div>
               <div class="flex justify-between items-center mb-2">
                  <label class="block text-sm font-bold text-gray-400">Attributes</label>
                  <button onClick={addAttr} class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm text-white">+ Add Attribute</button>
               </div>
               
               <div class="space-y-2">
                   {attrs.map((attr, i) => (
                       <div key={i} class="flex gap-2">
                           <input 
                              type="text" 
                              value={attr.name}
                              onInput={(e) => updateAttr(i, 'name', e.currentTarget.value)}
                              class="bg-gray-900 border border-gray-600 rounded p-2 w-1/3 text-white"
                              placeholder="Name"
                           />
                           <input 
                              type="text" 
                              value={attr.value}
                              onInput={(e) => updateAttr(i, 'value', e.currentTarget.value)}
                              class="bg-gray-900 border border-gray-600 rounded p-2 flex-1 text-white"
                              placeholder="Value"
                           />
                           <button onClick={() => removeAttr(i)} class="text-red-400 hover:text-red-300 px-2">×</button>
                       </div>
                   ))}
               </div>
           </div>
           
           <div class="pt-4 border-t border-gray-700 flex justify-end">
               <button 
                  onClick={handleSave} 
                  disabled={loading}
                  class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded transition duration-200 disabled:opacity-50"
               >
                   {loading ? "Saving..." : "Save Changes"}
               </button>
           </div>
       </div>
    </div>
  );
}
