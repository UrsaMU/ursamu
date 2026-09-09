SPIRIT INTERACTIONS -- bargain, chiminage, bind, banish

See also: +help spirit (overview), +help rite, +help fetish

SYNTAX
  +spirit/bargain <slug>=<offer>      Cha+Empathy vs def Gnosis
  +spirit/chiminage <slug>=<gift>     Cha+Rituals vs def Will
  +spirit/bind <slug>=<item>          Gnosis vs def Will
  +spirit/bind/talen <slug>=<item>    one-shot variant; diff+1
  +spirit/banish <slug>               Willpower vs def Will

BIND (W20 p.213 Rite of the Fetish)
  Cost: spend Gnosis = clamp(spirit.power, 1..5). Talen = half.
  Success auto-sets kind=fetish, fetishCost (= spirit Gnosis;
  talen=1), fetishDesc, spiritSlug. Talen adds state.talen=true.
  Botch taints the item (state.wyrmTainted=true); no spirit bound.

GATES
  Rank 2+, knows rite-of-the-fetish. Item kind=fetish or unkinded,
  not already housing a spirit, not Wyrm-tainted. Frenzy blocks.
  bargain/chiminage/banish need state.reality == penumbra.

SEE ALSO: +help spirit, +help fetish, +help rite
