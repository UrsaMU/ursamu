import pm2 from "pm2";

// Function to restart a PM2 process
function restartProcess(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pm2.restart(name, (err) => {
      if (err) {
        console.error(`Failed to restart ${name}:`, err);
        return reject(err);
      }
      console.log(`${name} restarted successfully.`);
      resolve();
    });
  });
}

export async function restartAll() {
  try {
    await restartProcess("MainProcess");
    console.log("All processes restarted.");
  } catch (err) {
    console.error("Error restarting processes:", err);
  } finally {
    // Disconnect from PM2 after restarting the processes
    pm2.disconnect();
  }
}
