# UrsaMU Shop Vendor Plugin

Generic Shop Vendor plugin for UrsaMU — supports creating shop vendor
NPCs, stocking/removing physical items in their inventory, and buying/selling
transaction flows with customizable lifecycle event hooks.

## Features

- **Vendor NPCs**: Spawn a vendor NPC in the current room with
  `+vendor/create`.
- **Physical Inventory**: Stock physical objects (e.g. weapons, gear) from a
  player's inventory directly into a vendor.
- **Stock Limits**: Stocked items support stock/quantity tracking. Buying a
  finite stocked item decrements its stock. Infinite stock is supported.
- **Transaction Flow**: Custom commands `+buy` and `+sell` allow players to
  buy items from vendors and sell carried items back to them.
- **Decoupled Hooks**: Leverages UrsaMU `gameHooks` for economy, currency
  verifications, and item formatting.

## Commands

- `+vendor/create <name>=<item:price:spec>|...`
  Spawns a vendor NPC in the current room with a legacy/default inventory.
- `+vendor/stock <vendor>=<item>[/<price>[/<stock>]]`
  Moves an item from your inventory into the vendor's location, configuring
  an optional price and stock (defaults to infinite stock).
- `+vendor/remove <vendor>=<item>`
  Retrieves a physical stocked item from the vendor back to your inventory.
- `+vendor/set <vendor>=<item>/<property>=<value>`
  Sets a property (`price`, `stock`, `desc` or `description`, or `spec`) on
  a stocked item in the vendor's inventory.
- `+list` (or `+shop`)
  Lists all vendors and their wares in the current room.
- `+buy <item>`
  Buys an item from a vendor in the room. Clones physical inventory
  templates.
- `+sell <item>`
  Sells a carried item to any vendor in the room (defaults to 50% price).

## Custom Formatting Slots

This plugin integrates with UrsaMU's format-attribute pipeline. You can
define a custom shop layout slot:

- **`VENDORFORMAT`**: Evaluated on the vendor NPC when rendering the shop
  wares listing via `+list`. It receives a space-separated list of the
  stocked physical item database IDs (e.g. `#101 #102`) as its default
  argument. If overridden via `@VENDORFORMAT` softcode or a TypeScript
  format handler on the backend, the returned string is used directly in
  place of the default vertical catalog view.

## Event Hooks

Implement these in your game/system plugin to customize economy behavior:

- `vendor:format_item`: Formats a legacy or physical item description.
- `vendor:check_funds`: Validates if a buyer has enough currency.
- `vendor:deduct_funds`: Deducts currency from a player on purchase.
- `vendor:add_funds`: Adds currency to a player on sale.
- `vendor:spawn_item`: Default spawning of legacy wares.
- `vendor:check_equipped`: Restricts selling equipped items.
- `vendor:get_item_price`: Determines default sell price of custom items.
- `vendor:purchased`: Triggered on successful item purchase transaction.
- `vendor:stocked`: Triggered when an item is physical-stocked in a vendor.
- `vendor:removed`: Triggered when an item is removed from a vendor.
- `vendor:set`: Triggered when an item property is set.

