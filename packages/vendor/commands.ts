import {
  addCmd,
  type IUrsamuSDK,
  header,
  divider,
  footer,
  gameHooks
} from "@ursamu/mush";

export interface VendorItem {
  name: string;
  price: number;
  spec: string;
}

export interface VendorState {
  inventory: VendorItem[];
}

addCmd({
  name: "+vendor/create",
  pattern: /^\+vendor\/create\s+(.+)\s*=\s*(.*)/i,
  lock: "connected builder+",
  category: "Vendor",
  help: `+vendor/create <name>=<item:price:spec>|<item:price:spec>...
  
Spawns a vendor NPC in the current room with a set of shop wares.
Format: name=item:price:spec|item:price:spec...

Examples:
  +vendor/create Blacksmith=Longsword:15:weapon:1d8:slashing
  +vendor/create Provisioner=Rations:1:general`,
  exec: async (u: IUrsamuSDK) => {
    const name = u.util.stripSubs(u.cmd.args[0]).trim();
    const waresSpec = u.util.stripSubs(u.cmd.args[1] || "").trim();

    if (!name || !waresSpec) {
      u.send("Usage: +vendor/create <name>=<item:price:spec>|...");
      return;
    }

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const itemsList: VendorItem[] = [];
    const entries = waresSpec.split("|");
    for (const entry of entries) {
      const parts = entry.split(":");
      if (parts.length < 3) continue;
      const itemName = parts[0].trim();
      const price = parseInt(parts[1].trim(), 10) || 5;
      const spec = parts.slice(2).join(":");
      itemsList.push({ name: itemName, price, spec });
    }

    const vendorState: VendorState = { inventory: itemsList };

    const thing = await u.db.create({
      flags: new Set(["thing"]),
      location: roomId,
      name,
      state: {
        name,
        vendor: vendorState,
        owner: u.me.id
      }
    });

    u.send(`Created vendor ${name} (#${thing.id}) in this room.`);
  }
});

addCmd({
  name: "+list",
  pattern: /^\+list$|^\+shop$/i,
  lock: "connected",
  category: "Vendor",
  help: `+list  -- List all shop vendors and their wares in the room.`,
  exec: async (u: IUrsamuSDK) => {
    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const items = await u.db.search({ location: roomId });
    const vendors = items.filter(
      i =>
        i.flags.has("thing") &&
        ((i.state as any).vendor || (i.state as any).dnd_vendor)
    );

    if (vendors.length === 0) {
      u.send("There are no shop vendors in this room.");
      return;
    }

    const lines: string[] = [];
    for (const v of vendors) {
      const physicalWares = await u.db.search({ location: v.id });
      const physicalItems = physicalWares.filter((w) =>
        w.flags.has("thing")
      );

      const idList = physicalItems.map((item) => `#${item.id}`).join(" ");
      let override: string | null = null;
      if (u.util.resolveFormat) {
        override = await u.util.resolveFormat(v, "VENDORFORMAT", idList);
      }
      if (override !== null) {
        lines.push(override);
        continue;
      }

      lines.push(header(`${v.name?.toUpperCase()}'S SHOP`));
      lines.push(
        `  ${u.util.ljust("Item", 24)}` +
          `${u.util.ljust("Price", 14)}Description`
      );
      lines.push(divider());

      const vState =
        (v.state as any).vendor || (v.state as any).dnd_vendor;
      const hasLegacy = vState?.inventory && vState.inventory.length > 0;
      const hasPhysical = physicalItems.length > 0;

      if (!hasLegacy && !hasPhysical) {
        lines.push("  (no items in stock)");
      } else {
        if (hasLegacy) {
          for (const item of vState.inventory) {
            const formatData = { spec: item.spec, desc: "", db: u.db };
            await gameHooks.emit("vendor:format_item", formatData);
            const desc = formatData.desc || "General item";
            lines.push(
              `  ${u.util.ljust(item.name, 24)}` +
                `${u.util.ljust(`${item.price} gp`, 14)}${desc}`
            );
          }
        }
        if (hasPhysical) {
          for (const item of physicalItems) {
            let price = (item.state as any).price ??
              (item.state as any).vendor?.price;
            if (price === undefined || price === null) {
              const priceData = { item, price: 10, db: u.db };
              await gameHooks.emit("vendor:get_item_price", priceData);
              price = priceData.price;
            }
            const spec = (item.state as any).spec ??
              (item.state as any).vendor?.spec ?? "";
            const formatData = { spec, desc: "", db: u.db };
            await gameHooks.emit("vendor:format_item", formatData);
            const desc = formatData.desc ||
              (item.state as any).description || "General item";

            const stockVal = (item.state as any).stock ??
              (item.state as any).vendor?.stock;
            const stockStr = stockVal !== undefined && stockVal <= 0
              ? " [Out of Stock]"
              : "";

            lines.push(
              `  ${u.util.ljust(item.name ?? "", 24)}` +
                `${u.util.ljust(`${price} gp${stockStr}`, 14)}${desc}`
            );
          }
        }
      }
      lines.push(footer());
    }

    u.send(lines.join("\n"));
  }
});

addCmd({
  name: "+buy",
  pattern: /^\+buy\s+(.*)/i,
  lock: "connected",
  category: "Vendor",
  help: `+buy <item>  -- Buy an item from a vendor in this room.`,
  exec: async (u: IUrsamuSDK) => {
    const itemName = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!itemName) {
      u.send("Buy what?");
      return;
    }

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const items = await u.db.search({ location: roomId });
    const vendors = items.filter(
      i =>
        i.flags.has("thing") &&
        ((i.state as any).vendor || (i.state as any).dnd_vendor)
    );

    let foundItem: any = null;
    let foundVendorName = "";
    let foundPhysicalItem: any = null;
    let matchedVendor: any = null;

    for (const v of vendors) {
      const physicalWares = await u.db.search({ location: v.id });
      const physicalMatch = physicalWares.find(
        (w: any) =>
          w.flags.has("thing") &&
          w.name?.toLowerCase() === itemName.toLowerCase()
      );

      if (physicalMatch) {
        foundPhysicalItem = physicalMatch;
        foundVendorName = v.name || "Vendor";
        matchedVendor = v;

        let price = (physicalMatch.state as any).price ??
          (physicalMatch.state as any).vendor?.price;
        if (price === undefined || price === null) {
          const priceData = { item: physicalMatch, price: 10, db: u.db };
          await gameHooks.emit("vendor:get_item_price", priceData);
          price = priceData.price;
        }

        const spec = (physicalMatch.state as any).spec ??
          (physicalMatch.state as any).vendor?.spec ?? "";

        foundItem = {
          name: physicalMatch.name,
          price,
          spec
        };
        break;
      }

      const vState =
        (v.state as any).vendor || (v.state as any).dnd_vendor;
      const match = vState.inventory?.find(
        (i: any) => i.name.toLowerCase() === itemName.toLowerCase()
      );
      if (match) {
        foundItem = match;
        foundVendorName = v.name || "Vendor";
        matchedVendor = v;
        break;
      }
    }

    if (!foundItem) {
      u.send(`No vendor is selling "${itemName}" here.`);
      return;
    }

    if (foundPhysicalItem) {
      const stockVal = (foundPhysicalItem.state as any).stock ??
        (foundPhysicalItem.state as any).vendor?.stock;
      if (stockVal !== undefined && stockVal <= 0) {
        u.send(`"${foundItem.name}" is out of stock.`);
        return;
      }
    }

    const fundsData = {
      actorId: u.me.id,
      price: foundItem.price,
      hasFunds: false,
      balance: 0,
      currency: "gp",
      db: u.db
    };
    await gameHooks.emit("vendor:check_funds", fundsData);

    if (!fundsData.hasFunds) {
      u.send(
        `You do not have enough ${fundsData.currency}. ` +
          `"${foundItem.name}" costs ${foundItem.price} ` +
          `${fundsData.currency}, but you only have ` +
          `${fundsData.balance} ${fundsData.currency}.`
      );
      return;
    }

    const deductData: Record<string, any> = {
      actorId: u.me.id,
      price: foundItem.price,
      success: false,
      db: u.db
    };
    await gameHooks.emit("vendor:deduct_funds", deductData);

    if (!deductData.success) {
      u.send("Transaction failed.");
      return;
    }

    let clone: any = null;
    if (foundPhysicalItem) {
      try {
        clone = await u.db.create({
          flags: new Set(foundPhysicalItem.flags),
          location: u.me.id,
          name: foundPhysicalItem.name,
          state: {
            ...foundPhysicalItem.state,
            owner: u.me.id,
            location: u.me.id,
            price: undefined,
            stock: undefined,
            vendor: undefined,
          }
        });

        const stockVal = (foundPhysicalItem.state as any).stock ??
          (foundPhysicalItem.state as any).vendor?.stock;
        if (typeof stockVal === "number" && stockVal > 0) {
          const newStock = stockVal - 1;
          if ((foundPhysicalItem.state as any).stock !== undefined) {
            await u.db.modify(foundPhysicalItem.id, "$set", {
              "data.stock": newStock
            });
            foundPhysicalItem.state.stock = newStock;
          } else if (
            (foundPhysicalItem.state as any).vendor?.stock !== undefined
          ) {
            await u.db.modify(foundPhysicalItem.id, "$set", {
              "data.vendor.stock": newStock
            });
            foundPhysicalItem.state.vendor.stock = newStock;
          }
        }
      } catch (err: any) {
        u.send("Failed to clone purchased item.");
        return;
      }
    } else {
      const spawnData = {
        actorId: u.me.id,
        itemName: foundItem.name,
        spec: foundItem.spec,
        success: false,
        db: u.db
      };
      await gameHooks.emit("vendor:spawn_item", spawnData);

      if (!spawnData.success) {
        u.send(`Failed to spawn/receive ${foundItem.name}.`);
        return;
      }
    }

    const purchaseData = {
      actorId: u.me.id,
      vendorId: matchedVendor?.id,
      itemName: foundItem.name,
      price: foundItem.price,
      clonedItemId: clone?.id,
      db: u.db
    };
    await gameHooks.emit("vendor:purchased", purchaseData);

    u.send(
      `You buy ${foundItem.name} from ${foundVendorName} ` +
        `for ${foundItem.price} ${fundsData.currency}. ` +
        `(Remaining: ${deductData.balance} ${fundsData.currency})`
    );
  }
});

addCmd({
  name: "+sell",
  pattern: /^\+sell\s+(.*)/i,
  lock: "connected",
  category: "Vendor",
  help: `+sell <item>  -- Sell an item from your inventory.`,
  exec: async (u: IUrsamuSDK) => {
    const itemName = u.util.stripSubs(u.cmd.args[0] || "").trim();
    if (!itemName) {
      u.send("Sell what?");
      return;
    }

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }

    const roomItems = await u.db.search({ location: roomId });
    const vendors = roomItems.filter(
      i =>
        i.flags.has("thing") &&
        ((i.state as any).vendor || (i.state as any).dnd_vendor)
    );
    if (vendors.length === 0) {
      u.send("There are no vendors here to sell to.");
      return;
    }

    const playerItems = await u.db.search({ location: u.me.id });
    const itemToSell = playerItems.find(
      i =>
        i.flags.has("thing") &&
        i.name?.toLowerCase() === itemName.toLowerCase()
    );

    if (!itemToSell) {
      u.send("You are not carrying that.");
      return;
    }

    const checkEquipped = {
      actorId: u.me.id,
      itemId: itemToSell.id,
      equipped: false,
      db: u.db
    };
    await gameHooks.emit("vendor:check_equipped", checkEquipped);

    if (checkEquipped.equipped) {
      u.send("You cannot sell equipped items. Unequip them first.");
      return;
    }

    // Determine price
    let originalPrice = 0;
    // Check if vendor lists it first
    for (const v of vendors) {
      const vState =
        (v.state as any).vendor || (v.state as any).dnd_vendor;
      const match = vState.inventory?.find(
        (i: any) => i.name.toLowerCase() === itemToSell.name?.toLowerCase()
      );
      if (match) {
        originalPrice = match.price;
        break;
      }
    }

    if (originalPrice === 0) {
      const priceData = {
        item: itemToSell,
        price: 10,
        db: u.db
      };
      await gameHooks.emit("vendor:get_item_price", priceData);
      originalPrice = priceData.price;
    }

    const sellPrice = Math.max(1, Math.floor(originalPrice * 0.5));

    const refundData = {
      actorId: u.me.id,
      amount: sellPrice,
      success: false,
      currency: "gp",
      balance: 0,
      db: u.db
    };
    await gameHooks.emit("vendor:add_funds", refundData);

    if (!refundData.success) {
      u.send("Failed to sell item.");
      return;
    }

    await u.db.destroy(itemToSell.id);

    u.send(
      `You sell ${itemToSell.name} to ${vendors[0].name} ` +
        `for ${sellPrice} ${refundData.currency}. ` +
        `(New Total: ${refundData.balance} ${refundData.currency})`
    );
  }
});

addCmd({
  name: "+vendor/stock",
  pattern: /^\+vendor\/stock\s+([^=]+)\s*=\s*([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/i,
  lock: "connected",
  category: "Vendor",
  help: `+vendor/stock <vendor>=<item>[/<price>[/<stock>]]
  
Stocks a physical item from your inventory into a vendor.
Sets optionally price and stock. Default stock is infinite.`,
  exec: async (u: IUrsamuSDK) => {
    const vendorName = u.cmd.args[0].trim();
    const itemRef = u.cmd.args[1].trim();
    const priceStr = u.cmd.args[2]?.trim();
    const stockStr = u.cmd.args[3]?.trim();

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const roomItems = await u.db.search({ location: roomId });
    const vendor = roomItems.find(
      i =>
        i.flags.has("thing") &&
        ((i.state as any).vendor || (i.state as any).dnd_vendor) &&
        i.name?.toLowerCase() === vendorName.toLowerCase()
    );

    if (!vendor) {
      u.send(`There is no vendor named "${vendorName}" here.`);
      return;
    }

    const ownerId = vendor.state.owner as string;
    const isOwner = ownerId === u.me.id ||
      u.me.flags.has("wizard") ||
      u.me.flags.has("admin") ||
      u.me.flags.has("superuser");
    if (!isOwner) {
      u.send("Permission denied. You do not own this vendor.");
      return;
    }

    const playerItems = await u.db.search({ location: u.me.id });
    const item = playerItems.find(
      i =>
        i.flags.has("thing") &&
        i.name?.toLowerCase() === itemRef.toLowerCase()
    );

    if (!item) {
      u.send(`You are not carrying "${itemRef}".`);
      return;
    }

    const checkEquipped = {
      actorId: u.me.id,
      itemId: item.id,
      equipped: false,
      db: u.db
    };
    await gameHooks.emit("vendor:check_equipped", checkEquipped);
    if (checkEquipped.equipped) {
      u.send("You cannot stock equipped items. Unequip them first.");
      return;
    }

    const updates: Record<string, any> = { "data.location": vendor.id };

    let price: number | undefined;
    if (priceStr !== undefined) {
      price = parseInt(priceStr, 10);
      if (isNaN(price)) {
        u.send("Price must be a number.");
        return;
      }
      updates["data.price"] = price;
    }

    let stock: number | undefined;
    if (stockStr !== undefined) {
      stock = parseInt(stockStr, 10);
      if (isNaN(stock)) {
        u.send("Stock must be a number.");
        return;
      }
      updates["data.stock"] = stock;
    }

    await u.db.modify(item.id, "$set", updates);

    item.location = vendor.id;
    if (price !== undefined) {
      if (!item.state) item.state = {};
      (item.state as any).price = price;
    }
    if (stock !== undefined) {
      if (!item.state) item.state = {};
      (item.state as any).stock = stock;
    }

    const stockData = {
      actorId: u.me.id,
      vendorId: vendor.id,
      itemId: item.id,
      price,
      stock,
      db: u.db
    };
    await gameHooks.emit("vendor:stocked", stockData);

    u.send(
      `Stocked ${item.name} in ${vendor.name} ` +
        `(Price: ${price !== undefined ? price + " gp" : "default"}, ` +
        `Stock: ${stock !== undefined ? stock : "infinite"}).`
    );
  }
});

addCmd({
  name: "+vendor/remove",
  pattern: /^\+vendor\/remove\s+([^=]+)\s*=\s*(.+)/i,
  lock: "connected",
  category: "Vendor",
  help: `+vendor/remove <vendor>=<item>
  
Removes a physical stocked item from a vendor's inventory.`,
  exec: async (u: IUrsamuSDK) => {
    const vendorName = u.cmd.args[0].trim();
    const itemRef = u.cmd.args[1].trim();

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const roomItems = await u.db.search({ location: roomId });
    const vendor = roomItems.find(
      i =>
        i.flags.has("thing") &&
        ((i.state as any).vendor || (i.state as any).dnd_vendor) &&
        i.name?.toLowerCase() === vendorName.toLowerCase()
    );

    if (!vendor) {
      u.send(`There is no vendor named "${vendorName}" here.`);
      return;
    }

    const ownerId = vendor.state.owner as string;
    const isOwner = ownerId === u.me.id ||
      u.me.flags.has("wizard") ||
      u.me.flags.has("admin") ||
      u.me.flags.has("superuser");
    if (!isOwner) {
      u.send("Permission denied. You do not own this vendor.");
      return;
    }

    const vendorItems = await u.db.search({ location: vendor.id });
    const item = vendorItems.find(
      i =>
        i.flags.has("thing") &&
        i.name?.toLowerCase() === itemRef.toLowerCase()
    );

    if (!item) {
      u.send(`"${vendor.name}" is not stocking "${itemRef}".`);
      return;
    }

    await u.db.modify(item.id, "$set", { "data.location": u.me.id });
    item.location = u.me.id;

    const removeData = {
      actorId: u.me.id,
      vendorId: vendor.id,
      itemId: item.id,
      db: u.db
    };
    await gameHooks.emit("vendor:removed", removeData);

    u.send(
      `Removed ${item.name} from ${vendor.name} and placed it ` +
        `in your inventory.`
    );
  }
});

addCmd({
  name: "+vendor/set",
  pattern: /^\+vendor\/set\s+([^=]+)\s*=\s*([^/]+)\/([^=]+)\s*=\s*(.*)/i,
  lock: "connected",
  category: "Vendor",
  help: `+vendor/set <vendor>=<item>/<property>=<value>
  
Sets a property on a stocked item inside a vendor's inventory.
Supported properties: price, stock, desc (or description), spec.`,
  exec: async (u: IUrsamuSDK) => {
    const vendorName = u.cmd.args[0].trim();
    const itemRef = u.cmd.args[1].trim();
    const property = u.cmd.args[2].trim().toLowerCase();
    const value = u.cmd.args[3].trim();

    const roomId = u.me.location;
    if (!roomId) {
      u.send("You are not in a room.");
      return;
    }
    const roomItems = await u.db.search({ location: roomId });
    const vendor = roomItems.find(
      i =>
        i.flags.has("thing") &&
        ((i.state as any).vendor || (i.state as any).dnd_vendor) &&
        i.name?.toLowerCase() === vendorName.toLowerCase()
    );

    if (!vendor) {
      u.send(`There is no vendor named "${vendorName}" here.`);
      return;
    }

    const ownerId = vendor.state.owner as string;
    const isOwner = ownerId === u.me.id ||
      u.me.flags.has("wizard") ||
      u.me.flags.has("admin") ||
      u.me.flags.has("superuser");
    if (!isOwner) {
      u.send("Permission denied. You do not own this vendor.");
      return;
    }

    const vendorItems = await u.db.search({ location: vendor.id });
    const item = vendorItems.find(
      i =>
        i.flags.has("thing") &&
        i.name?.toLowerCase() === itemRef.toLowerCase()
    );

    if (!item) {
      u.send(`"${vendor.name}" is not stocking "${itemRef}".`);
      return;
    }

    if (property === "price") {
      const price = parseInt(value, 10);
      if (isNaN(price)) {
        u.send("Price must be a number.");
        return;
      }
      await u.db.modify(item.id, "$set", { "data.price": price });
      if (!item.state) item.state = {};
      (item.state as any).price = price;
      u.send(`Set price of ${item.name} to ${price} gp.`);
    } else if (property === "stock") {
      if (value.toLowerCase() === "infinite" || value === "-1") {
        await u.db.modify(item.id, "$unset", { "data.stock": "" });
        if (item.state) {
          delete (item.state as any).stock;
        }
        u.send(`Set stock of ${item.name} to infinite.`);
      } else {
        const stock = parseInt(value, 10);
        if (isNaN(stock)) {
          u.send("Stock must be a number or 'infinite'.");
          return;
        }
        await u.db.modify(item.id, "$set", { "data.stock": stock });
        if (!item.state) item.state = {};
        (item.state as any).stock = stock;
        u.send(`Set stock of ${item.name} to ${stock}.`);
      }
    } else if (property === "desc" || property === "description") {
      await u.db.modify(item.id, "$set", { "data.description": value });
      if (!item.state) item.state = {};
      (item.state as any).description = value;
      u.send(`Set description of ${item.name}.`);
    } else if (property === "spec") {
      await u.db.modify(item.id, "$set", { "data.spec": value });
      if (!item.state) item.state = {};
      (item.state as any).spec = value;
      u.send(`Set spec of ${item.name} to "${value}".`);
    } else {
      u.send(
        `Unknown property "${property}". Use: price, stock, desc, spec.`
      );
      return;
    }

    const setData = {
      actorId: u.me.id,
      vendorId: vendor.id,
      itemId: item.id,
      property,
      value,
      db: u.db
    };
    await gameHooks.emit("vendor:set", setData);
  }
});
