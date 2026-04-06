import { createOpencode } from "@opencode-ai/sdk";
import path from "path";
import process from "process";
import temp from "temp";
import fs from "node:fs/promises";

export async function prepareCopy (job, opts) {
  const { skill, resource, subresource, implementationRepository, log } = opts;
  const _log = log || ((msg) => job.log(msg));

  // Log implementation repository path
  await _log(`Implementation Repository Path: ${JSON.stringify(implementationRepository)}`);

  const tempDir = temp.mkdirSync('opencode-workspace-', Math.random().toString(36).substring(2, 15));
  const sourceDir = path.dirname(
    path.join(implementationRepository.data.resourcePath, 'repository')
  );

  // Copy files from sourceDir to tempDir
  await fs.cp(sourceDir, tempDir, {recursive: true});

  await _log(`Copied files from ${sourceDir} to temporary workspace at ${tempDir}`);

  return {
    workspaceDir: tempDir
  };
}

export async function cleanup (job, prep, opts) {
  const { skill, resource, subresource, implementationRepository } = opts;

  // Remove the temporary directory
  // await fs.rm(prep.workspaceDir, { recursive: true, force: true });
}

export async function execute (job, prep, opts) {
  const { skill, resource, subresource, implementationRepository, persona, prompt, log } = opts;
  const _log = log || ((msg) => job.log(msg));

  const {
    workspaceDir
  } = prep;
  
  await _log(`🚀 Initializing OpenCode Session...`);
  await _log(`📂 Workspace Location: ${workspaceDir}`);

  // 1. Change the process working directory to the target location.
  // OpenCode uses the current working directory as the workspace root.
  try {
    process.chdir(workspaceDir);
  } catch (err) {
    console.error(`❌ Error: Could not switch to directory "${workspaceDir}".\n${err.message}`);
    throw err;
  }

  // 2. Initialize the OpenCode Server and Client
  // This starts a local server instance bound to the current directory.
  const { client, server } = await createOpencode({
    // You can override default config here if needed, or rely on opencode.json
    // Ensure the model matches the provider/model format
    model: "ollama/llama3.2:latest",
    port: 0, // Use 0 for dynamic port assignment
  });

  try {
    // 3. Create a new Session
    const session = await client.session.create({
      body: {
        title: "OpenCode Execution Task"
      }
    });
    
    const sessionId = session.data.id; // Adjust based on exact response shape (id or session_id)
    await _log(`✅ Session Created (ID: ${sessionId})`);

    // 4. Prompt the Agent
    // We explicitly ask it to perform the task using the processed prompt from the persona.
    // The OpenCode agent uses tools (file.read, file.write, etc.)
    // to access the filesystem context we set earlier.
    
    await _log(`📤 Sending prompt: "${prompt}"`);

    const response = await client.session.prompt({
      path: {
        id: sessionId
      },
      body: {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-20250514"
          // modelID: "claude-3-5-sonnet-20241022"
        },
        parts: [
          {
            type: "text",
            text: prompt
          }
        ],
        // Ensure tools are enabled if your specific model/config requires explicit activation
        // tools: true 
      }
    });

    await _log(`✅ Prompt processed.`);
    await _log(JSON.stringify(response, null, 2));
    
    return response;
  } finally {
      // 5. Cleanup: Stop the OpenCode server
      await server.close();
      console.log(`🛑 OpenCode Server stopped.`);
  }
};
