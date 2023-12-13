import { join } from "path";
import pm2 from "pm2";

// Function to start a PM2 process
function startProcess(
  scriptPath: string,
  name: string,
  directory?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    pm2.start(
      {
        script: "ts-node",
        args: `${join(__dirname, scriptPath)} --dir=${directory}`,
        name: name,
        exec_mode: "fork",
      },
      (err) => {
        if (err) {
          console.error(`Failed to start ${name}:`, err);
          return reject(err);
        }
        console.log(`${name} started successfully.`);
        resolve();
      }
    );
  });
}

export async function startAll(directory?: string) {
  try {
    await startProcess("../main.ts", "MainProcess", directory); // Pass directory
    await startProcess("../telnet.ts", "TelnetProcess", directory); // Pass directory
  } catch (err) {
    console.error("Error starting processes:", err);
  } finally {
    pm2.disconnect();
  }
}
