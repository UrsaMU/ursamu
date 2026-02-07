
/**
 * System Script: help.ts
 * 
 * Handles the help command.
 * Reads help files from `help/` directory (including subdirectories) and lists commands.
 * Supports hierarchical topics (e.g., `help mail/send`).
 */

interface IDBObj {
  id: string;
  name?: string;
  location?: string;
  flags: Set<string>;
  state: Record<string, unknown>;
  contents: IDBObj[];
}

interface IUrsamuSDK {
    me: IDBObj;
    cmd: { args: string[] };
    util: {
        target(actor: IDBObj, query: string): Promise<IDBObj | undefined>;
    };
    send(message: string | string[], target?: string): void;
    force(command: string): void;
}

const stripColors = (text: string) => text.replace(/%(ch|cn|cr|cg|cy|cw|cb|cm|ci|cx|c[rgbcmyw]|b[rgbcmyw]|x[0-9]{1,3}|[rhniub])/gi, "");

const center = (text: string, width: number, padChar: string = " ") => {
    const len = stripColors(text).length; 
    if (len >= width) return text;
    const left = Math.floor((width - len) / 2);
    const right = width - len - left;
    return padChar.repeat(left) + text + padChar.repeat(right);
};

const repeatString = (text: string, count: number) => {
    return text.repeat(count);
};

const columns = (list: string[], width: number, cols: number, padChar: string = " ") => {
    if (!list.length) return "";
    const colWidth = Math.floor(width / cols);
    let output = "";
    for (let i = 0; i < list.length; i += cols) {
        const row = list.slice(i, i + cols);
        output += row.map(item => {
            const visibleLen = stripColors(item).length;
            const padding = Math.max(0, colWidth - visibleLen);
            return item + padChar.repeat(padding);
        }).join("") + "\n";
    }
    return output;
};

const wordWrap = (text: string, width: number): string => {
    // Split into paragraphs to preserve structure
    const lines = text.split("\n");
    
    return lines.map(line => {
        // preserve code blocks or placeholders
        if (line.includes("__CODEBLOCK_")) return line;
        if (line.trim() === "") return "";

        // Detect indentation (important for lists)
        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        
        // Clean words
        const words = line.trim().split(/\s+/);
        if (words.length === 0) return "";
        
        let currentLine = indent + words[0];
        let result = "";

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            // Check length with next word
            if (stripColors(currentLine + " " + word).length <= width) {
                currentLine += " " + word;
            } else {
                result += currentLine + "\n";
                // Start new line with same indentation
                currentLine = indent + word;
            }
        }
        result += currentLine;
        return result;
    }).join("\n");
};

const renderMarkdown = (text: string): string => {
    let output = text;

    // 1. Code Blocks (``` ... ```)
    const codeBlocks: string[] = [];
    output = output.replace(/```([\s\S]*?)```/g, (match, code) => {
        const indented = code.split("\n").map((line: string) => "  " + line).join("\n");
        codeBlocks.push(`%ch%cg${indented}%cn`);
        return `__CODEBLOCK_${codeBlocks.length - 1}__`;
    });

    // 2. Inline Code (`...`)
    output = output.replace(/`([^`]+)`/g, "%ch%cg$1%cn");

    // 3. Headers
    output = output.replace(/^#\s+(.+)$/gm, (match, title) => {
        return `%ch%cc# ${title}%cn`;
    });

    output = output.replace(/^##\s+(.+)$/gm, "\n%ch%cy## $1%cn");
    output = output.replace(/^###\s+(.+)$/gm, "\n%ch%cw$1%cn");

    // 4. Bold / Italic
    output = output.replace(/\*\*([^*]+)\*\*/g, "%ch$1%cn"); // Bold
    output = output.replace(/\*([^*]+)\*/g, "%ci$1%cn");     // Italic

    // 5. Lists ( - item)
    output = output.replace(/^\s*-\s+(.+)$/gm, "  • $1");

    // 6. Word Wrap
    output = wordWrap(output, 78);

    // Restore Code Blocks
    output = output.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
        return "\n" + codeBlocks[parseInt(index)] + "\n";
    });

    return output;
};

// Recursive function to scan help directory
const scanHelp = async (path: string, prefix: string = "", helpFiles: Map<string, string>, topics: Set<string>, subTopics: Map<string, string[]>) => {
    for await (const entry of Deno.readDir(path)) {
        if (entry.name.startsWith(".")) continue;

        if (entry.isFile && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
            try {
                const content = await Deno.readTextFile(`${path}/${entry.name}`);
                const rawName = entry.name.replace(/\.(md|txt)$/, "").toLowerCase();
                
                // Normalization
                let topicName = rawName;
                if (topicName.startsWith("help_")) topicName = topicName.slice(5);
                if (topicName.startsWith("topic_")) topicName = topicName.slice(6);
                if (topicName.startsWith("@")) topicName = topicName.slice(1);
                
                const fullKey = prefix ? `${prefix}/${topicName}` : topicName;
                
                helpFiles.set(fullKey, content);
                
                if (topicName === "index" || topicName === "readme") {
                     helpFiles.set(prefix, content); 
                } else {
                     if (!helpFiles.has(topicName)) {
                         helpFiles.set(topicName, content);
                     }
                }
                
                // Add to subtopics of parent
                if (prefix) {
                    if (!subTopics.has(prefix)) subTopics.set(prefix, []);
                    if (topicName !== "index" && topicName !== "readme") {
                        subTopics.get(prefix)?.push(topicName);
                    }
                } else {
                    topics.add(topicName);
                }
            } catch (e) {
                console.error(`Failed to read help file ${entry.name}:`, e);
            }
        } else if (entry.isDirectory) {
             const dirName = entry.name.toLowerCase();
             topics.add(dirName);
             await scanHelp(`${path}/${entry.name}`, dirName, helpFiles, topics, subTopics);
        }
    }
};

export default async (u: IUrsamuSDK) => {
    const args = u.cmd.args;
    let topic = args[0] ? args[0].toLowerCase() : "";
    topic = topic.replace(/\s+/g, "/");

    const helpFiles = new Map<string, string>();
    const topics = new Set<string>();
    const subTopics = new Map<string, string[]>();

    try {
        for await (const entry of Deno.readDir("./system/scripts")) {
            if (entry.isFile && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
                if (entry.name.startsWith(".")) continue;
                const name = entry.name.replace(/\.(ts|js)$/, "").toLowerCase();
                topics.add(name);
            }
        }
        await scanHelp("./help", "", helpFiles, topics, subTopics);
    } catch (e) {
        u.send(`%ch%crError loading help files:%cn ${e}`);
        return;
    }

    if (!topic) {
        // Main Help Index
        const sortedTopics = Array.from(topics).sort();
        const cleanTopics = sortedTopics.filter(t => t.length > 0);

        let output = center(`%cy[%cn %chHELP SYSTEM%cn %cy]%cn`, 78, "%cr=%cn") + "\n";
        output += center(`%cy[%cn %chTOPICS%cn %cy]%cn`, 78, "%cr-%cn") + "\n";
        output += columns(cleanTopics.map(t => {
            if (subTopics.has(t)) return t.toUpperCase() + "/";
            return t.toUpperCase();
        }), 78, 4) + "\n";
        
        output += repeatString("%cr=%cn", 78) + "\n";
        output += "Type '%chhelp <topic>%cn' for more information.\n";
        
        u.send(output);
    } else {
        // Specific Topic Logic
        const findContent = (t: string) => {
            if (helpFiles.has(t)) return helpFiles.get(t);
            let normT = t;
            if (normT.startsWith("@")) normT = normT.slice(1);
            if (helpFiles.has(normT)) return helpFiles.get(normT);
            return null;
        };

        const content = findContent(topic);
        let normTopic = topic;
        if (normTopic.startsWith("@")) normTopic = normTopic.slice(1);
        
        const children = subTopics.get(normTopic);

        if (content || (children && children.length > 0)) {
            let header = `%cy[%cn %ch${topic.toUpperCase()}%cn %cy]%cn`;
            let output = center(header, 78, "%cr-%cn") + "\n";
            
            if (content) {
                output += renderMarkdown(content) + "\n";
            }
            
            if (children && children.length > 0) {
                 if (content) output += "\n";
                 output += center(`%cy[%cn %chSUB-TOPICS%cn %cy]%cn`, 78, "%cr-%cn") + "\n";
                 output += columns(children.map(t => {
                     if (subTopics.has(`${normTopic}/${t}`)) return t.toUpperCase() + "/";
                     return t.toUpperCase();
                 }), 78, 4) + "\n";
            }
            
            output += repeatString("%cr-%cn", 78);
            u.send(output);
        } else {
             if (topics.has(normTopic)) {
                 u.send(`Topic '${topic}' exists (as a command) but has no help file.`);
             } else {
                 u.send(`No help available for '${topic}'.`);
             }
        }
    }
};