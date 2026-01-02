#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "$fresh/dev.ts";
import config from "./fresh.config.ts";

import "jsr:@std/dotenv@0.224.0/load";

await dev(import.meta.url, "./main.ts", config);
