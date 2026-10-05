import { buyKey, renderMarketList } from "./commands/market.ts";
console.log("pkd", buyKey("charon-pkd-45-police-special-revolver"));
console.log("orch", buyKey("orchard-technologies-machine-link"));
const plain = (s: string) => s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "");
for (const l of renderMarketList({query:"firearm", bityuan:700, playerId:"x"})) {
  const p = plain(l);
  console.log(String(p.length).padStart(3), p);
}
