
import { dfs, dpath } from "../../deps.ts";

const LOG_DIR = "./logs";

async function ensureLogDir() {
    try {
        await Deno.mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) {
            console.error("Failed to create log directory:", error);
        }
    }
}

export const logError = async (error: any, context: string = "") => {
    await ensureLogDir();
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
    const logEntry = `[${timestamp}] [ERROR] ${context}: ${errorMessage}\n`;

    console.error(logEntry);

    try {
        await Deno.writeTextFile(dpath.join(LOG_DIR, "error.log"), logEntry, { append: true });
    } catch (e) {
        console.error("Failed to write to error log:", e);
    }
};
