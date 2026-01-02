
import { dpath } from "../../../deps.ts";

export class GitService {
    private repoPath: string;

    constructor() {
        this.repoPath = dpath.join(Deno.cwd(), "softcode_repo");
    }

    async init(repoUrl: string) {
        // cleanup old if exists
        try {
            await Deno.remove(this.repoPath, { recursive: true });
        } catch { /* ignore */ }
        
        await this.run("clone", repoUrl, this.repoPath);
    }

    async pull() {
        await this.run("pull", { cwd: this.repoPath });
    }

    async push(message: string) {
        await this.run("add", ".", { cwd: this.repoPath });
        await this.run("commit", "-m", message, { cwd: this.repoPath });
        await this.run("push", { cwd: this.repoPath });
    }

    async status() {
        return await this.run("status", "-s", { cwd: this.repoPath });
    }

    // deno-lint-ignore no-explicit-any
    private async run(cmd: string, ...args: any[]) {
        let cwd = Deno.cwd();
        let cmdArgs = [cmd];
        
        // Handle options object as last arg
        const lastArg = args[args.length - 1];
        if (typeof lastArg === "object" && lastArg.cwd) {
            cwd = lastArg.cwd;
            args.pop();
        }
        
        cmdArgs = [...cmdArgs, ...args];

        const command = new Deno.Command("git", {
            args: cmdArgs,
            cwd: cwd,
            stdout: "piped",
            stderr: "piped",
        });

        const { code, stdout, stderr } = await command.output();
        const outStr = new TextDecoder().decode(stdout);
        const errStr = new TextDecoder().decode(stderr);

        if (code !== 0) {
            throw new Error(`Git error: ${errStr || outStr}`);
        }

        return outStr;
    }
    
    get path() {
        return this.repoPath;
    }
}

export const git = new GitService();
