/**
 * @module stdlib/object
 *
 * Object stdlib — loads all sub-modules via side-effect imports so their
 * register() calls execute at startup.
 *
 * Sub-modules:
 *   object-identity  — name, type, flags
 *   object-attrs     — get/set, hasattr, lattr, u(), eval()
 *   object-location  — loc, owner, parent, lcon, controls, visible
 *   object-server    — time, connection, channels, counts, lsearch
 */

import "./object-identity.ts";
import "./object-attrs.ts";
import "./object-location.ts";
import "./object-server.ts";
