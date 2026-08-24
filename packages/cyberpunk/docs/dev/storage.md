+DEV/STORAGE

Plugin data storage overview for the CPR plugin.

CHARACTER STATE
  Player data lives on IDBObj.state.cpr as ICPRCharacter.
  Written with atomic $set operations only — never full overwrite.

  Read pattern:
    const cpr = u.me.state.cpr as ICPRCharacter | undefined;
    if (!cpr?.chargenComplete) { u.send("No character."); return; }

  Write pattern:
    await u.db.modify(id, "$set", { "state.cpr.hp": val });
    await u.db.modify(id, "$inc", { "state.cpr.reputation": 1 });

DBO COLLECTIONS (all prefixed cpr.)
  cpr.combat        Active combat trackers, one per room
  cpr.netruns       Active netrunning sessions
  cpr.architectures Persistent NET architectures
  cpr.markets       Night and Midnight Market instances
  cpr.listings      Items for sale in a market
  cpr.projects      In-progress Tech Maker craft projects
  cpr.blueprints    Tech blueprints owned by a character
  cpr.chopshop      Chop shop harvest/install jobs
  cpr.pharma        Pharmaceutical synthesis projects
  cpr.jobs          Jobs board listings

SEE ALSO: `storage-char.md`, `storage-dbo.md`
