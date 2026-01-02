import { registerFunction } from "./registry.ts";

registerFunction("setq", (args, _data, ctx) => {
    // setq(REG, VAL)
    if (!ctx) return ""; // Should not happen with new parser
    const reg = args[0].toLowerCase();
    const val = args[1];
    if (reg.length === 1) { // Basic registers
        ctx.registers[reg] = val;
    }
    // Extended registers: MUX supports naming?
    // We already support `registers[name]` in parser context.
    // So yes, we can support multi-char registers via setq if parser supports %q(name).
    // Parser currently only supports %q<char>.
    return ""; // setq returns empty
});

registerFunction("r", (args, _data, ctx) => {
    if (!ctx) return "";
    const reg = args[0].toLowerCase();
    return ctx.registers[reg] || "";
});

// iter is already in list.ts? 
// Check list.ts content.
// If it needs to set registers (%# and %0), it needs to be updated.
// I'll update list.ts instead of adding it here.

registerFunction("timestring", (args) => {
    const seconds = parseInt(args[0]);
    if (isNaN(seconds)) return "0s";
    
    // Simple formatter
    // MUX: 1d 02:03:04
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (d > 0) return `${d}d ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
});
