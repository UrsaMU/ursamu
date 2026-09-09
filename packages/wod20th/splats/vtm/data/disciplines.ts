// V20 common + clan Disciplines (chargen catalog).
import type { IDisciplineDef } from "../../../core/types.ts";

function d(
  name: string,
  book: string,
): IDisciplineDef {
  const id = name.toLowerCase().replace(/\s+/g, "-");
  return { id, name, book };
}

export const VTM_DISCIPLINES: Record<string, IDisciplineDef> = {
  animalism: d("Animalism", "V20 p.128"),
  auspex: d("Auspex", "V20 p.132"),
  celerity: d("Celerity", "V20 p.142"),
  chimerstry: d("Chimerstry", "V20 p.144"),
  dementation: d("Dementation", "V20 p.147"),
  dominate: d("Dominate", "V20 p.152"),
  fortitude: d("Fortitude", "V20 p.158"),
  necromancy: d("Necromancy", "V20 p.159"),
  obfuscate: d("Obfuscate", "V20 p.184"),
  obtenebration: d("Obtenebration", "V20 p.188"),
  potence: d("Potence", "V20 p.192"),
  presence: d("Presence", "V20 p.193"),
  protean: d("Protean", "V20 p.198"),
  quietus: d("Quietus", "V20 p.203"),
  serpentis: d("Serpentis", "V20 p.208"),
  thaumaturgy: d("Thaumaturgy", "V20 p.212"),
  "thaumaturgical-countermagic": d(
    "Thaumaturgical Countermagic",
    "V20 p.228",
  ),
  vicissitude: d("Vicissitude", "V20 p.240"),
};

export const DISCIPLINE_NAMES: readonly string[] = Object.values(
  VTM_DISCIPLINES,
).map((x) => x.name);
