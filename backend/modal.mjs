import { ModalClient } from "modal";

import dotenv from "dotenv";
dotenv.config();

const repoUrl = "https://github.com/your-username/your-repo.git";
const repoName = "your-repo"; // Setup dynamic extraction if preferred

async function main() {
  // 1. Initialize the Modal Client
  const modal = new ModalClient();

  console.log("🚀 Spawning remote environment...");

  const app = await modal.apps.fromName("libmodal-example", {
    createIfMissing: true,
  });

  // 2. Define the remote environment (Image)
  // We use the official Node.js image which includes 'npm' and 'git'
  const image = await modal.images.fromRegistry("node:22");

  // 3. Create the Sandbox
  // We attach secrets for GitHub (cloning) and the LLM (running OpenCode)
  const sandbox = await modal.sandboxes.create(app, image, {
    cpu: 2,
    memoryMiB: 8192, // 8 GB RAM
    secrets: [
      await modal.secrets.fromName("my-llm-secret"), // Contains ANTHROPIC_API_KEY, etc.
      // await modal.secrets.fromName("my-git-secret"), // Contains GITHUB_TOKEN
    ],
    // timeoutMs: 360000, // Keep alive for 1 hour
  });

  console.log(`✅ Sandbox created: ${sandbox.data.id}`);

  // 4. Setup: Install OpenCode & Clone Repo
  // We run these commands sequentially inside the remote machine
  const setupCommands = ["npm install -g opencode-ai"];

  for (const cmd of setupCommands) {
    const proc = await sandbox.exec(cmd.split(" "));
    if (proc.exitCode !== 0) {
      console.error("Setup failed:", await proc.stdout.readText());
      console.error("Setup failed:", await proc.stderr.readText());
      continue;
    }
  }

  // 5. Run OpenCode (Headless Mode)
  // Example: Ask the agent to analyze the repo
  console.log("🤖 Running OpenCode Agent...");

  const prompt =
    "Analyze this repository and summarize what it does in a file called REPORT.md";

  const agentProc = await sandbox.exec(["opencode", "run", prompt], {
    cwd: `/root/${repoName}`, // Run inside the repo folder
    stdout: "pipe", // Stream stdout (default)
    stderr: "pipe", // Stream stderr
    mode: "text", // Text mode for string chunks
  });

  // Stream both stdout and stderr concurrently to your local terminal
  console.log("📡 Streaming live logs...\n");

  await Promise.all([
    // Stream stdout
    (async () => {
      for await (const chunk of agentProc.stdout) {
        process.stdout.write(chunk);
      }
    })(),
    // Stream stderr
    (async () => {
      for await (const chunk of agentProc.stderr) {
        process.stderr.write(chunk);
      }
    })(),
  ]);

  // Wait for process completion and get exit code
  const exitCode = await agentProc.wait();

  console.log(`\n✅ Task complete. Exit code: ${exitCode}`);
}

main().catch(console.error);
