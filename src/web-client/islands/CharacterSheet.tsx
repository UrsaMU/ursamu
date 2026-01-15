import { useEffect, useState } from "preact/hooks";

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
  const [token, setToken] = useState<string | null>(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("ursamu_token")
      : null,
  );
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
      const payload = JSON.parse(atob(token.split(".")[1]));
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
          "Authorization": `Bearer ${token}`,
        },
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
          attributes: attrs,
        },
      };

      const res = await fetch(`http://localhost:4203/api/v1/dbobj/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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
    setAttrs([...attrs, {
      name: "NEW_ATTR",
      value: "Value",
      setter: user?.id || "",
    }]);
  };

  const removeAttr = (idx: number) => {
    setAttrs(attrs.filter((_, i) => i !== idx));
  };

  if (!token) {
    return (
      <div class="text-white p-4">Please login via the Game Client first.</div>
    );
  }

  if (loading && !user) return <div class="text-white p-4">Loading...</div>;

  return (
    <div class="max-w-4xl mx-auto bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl text-slate-200 mt-8 transition-all duration-500">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-3xl font-header font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-200 uppercase tracking-widest">
          Character Sheet: {user?.data?.name}
        </h2>
        <button
          type="button"
          onClick={loadData}
          class="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full"
        >
          Reload
        </button>
      </div>

      {error && (
        <div class="bg-red-900/50 text-red-200 p-3 rounded mb-4">{error}</div>
      )}
      {success && (
        <div class="bg-green-900/50 text-green-200 p-3 rounded mb-4">
          {success}
        </div>
      )}

      <div class="space-y-6">
        {/* Description */}
        <div>
          <label class="block text-sm font-bold text-gray-400 mb-2">
            Description
          </label>
          <textarea
            value={desc}
            onInput={(e) => setDesc(e.currentTarget.value)}
            class="w-full bg-black/20 border border-white/5 rounded-xl p-4 text-slate-200 h-32 focus:border-primary/50 focus:bg-black/40 focus:outline-none transition-all duration-300 resize-none"
          />
        </div>

        {/* Attributes */}
        <div>
          <div class="flex justify-between items-center mb-2">
            <label class="block text-sm font-bold text-slate-400 uppercase tracking-wider">
              Attributes
            </label>
            <button
              type="button"
              onClick={addAttr}
              class="bg-primary hover:bg-orange-600 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-primary/20 transition-all"
            >
              + Add Attribute
            </button>
          </div>

          <div class="space-y-2">
            {attrs.map((attr, i) => (
              <div key={i} class="flex gap-2">
                <input
                  type="text"
                  value={attr.name}
                  onInput={(e) => updateAttr(i, "name", e.currentTarget.value)}
                  class="bg-black/20 border border-white/5 rounded-lg p-3 w-1/3 text-slate-200 focus:border-primary/50 focus:outline-none transition-all"
                  placeholder="Name"
                />
                <input
                  type="text"
                  value={attr.value}
                  onInput={(e) => updateAttr(i, "value", e.currentTarget.value)}
                  class="bg-black/20 border border-white/5 rounded-lg p-3 flex-1 text-slate-200 focus:border-primary/50 focus:outline-none transition-all"
                  placeholder="Value"
                />
                <button
                  type="button"
                  onClick={() => removeAttr(i)}
                  class="text-slate-500 hover:text-red-400 px-3 transition-colors text-xl"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div class="pt-4 border-t border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            class="bg-primary hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
