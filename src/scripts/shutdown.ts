import pm2 from "pm2";

// Function to stop a PM2 process
function stopProcess(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pm2.delete(name, (err) => {
      if (err) {
        console.error(`Failed to stop ${name}:`, err);
        return reject(err);
      }
      console.log(`${name} stopped successfully.`);
      resolve();
    });
  });
}

export async function stopAll() {
  try {
    await stopProcess("MainProcess");
    await stopProcess("TelnetProcess");
    console.log("All processes stopped.");
  } catch (err) {
    console.error("Error stopping processes:", err);
  } finally {
    // Disconnect from PM2 after stopping the processes
    pm2.disconnect();
  }
}
