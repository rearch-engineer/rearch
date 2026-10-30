/**
 * Hook Loader Utility
 * Dynamically loads hooks for connection lifecycle events
 */

/**
 * Load a hook for a specific provider and hook type
 * @param {string} provider - The connection provider (e.g., 'bitbucket', 'file')
 * @param {string} hookType - The hook type ('create', 'update', 'delete')
 * @returns {Function|null} The hook function or null if not found
 */
export async function loadHook(provider, hookType) {
  try {
    const path = `../tools/${provider}/hooks/${hookType}.js`;
    console.log(`Loading hook from path: ${path}`);
    const module = await import(path);
    return module.default;
  } catch (error) {
    console.error(`Error loading hook for provider: ${provider}, type: ${hookType}`, error);
    // Hook doesn't exist - this is fine, hooks are optional
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    // Re-throw other errors (syntax errors, etc.)
    throw error;
  }
}

/**
 * Execute a create hook if it exists
 * @param {Object} connection - The created connection (with _id)
 * @returns {Object} The hook result or the original connection data
 */
export async function executeCreateHook(connection) {
  const hook = await loadHook(connection.provider, 'create');
  if (!hook) {
    return connection.data;
  }
  
  const result = await hook({connection});
  return result;
}

/**
 * Execute an update hook if it exists
 * @param {string} provider - The connection provider
 * @param {Object} originalConnection - The connection before update
 * @param {Object} updatedConnection - The connection after update
 * @returns {Object} The hook result or the updated connection data
 */
export async function executeUpdateHook(provider, originalConnection, updatedConnection) {
  const hook = await loadHook(provider, 'update');
  if (!hook) {
    return updatedConnection.data;
  }
  
  const result = await hook(originalConnection, updatedConnection);
  return result;
}

/**
 * Execute a delete hook if it exists
 * @param {string} provider - The connection provider
 * @param {Object} connection - The connection being deleted
 * @returns {void}
 */
export async function executeDeleteHook(provider, connection) {
  const hook = await loadHook(provider, 'delete');
  if (!hook) {
    return;
  }
  
  await hook(connection);
}

/**
 * Execute a search hook if it exists (for resources)
 * @param {Object} connection - The parent connection
 * @param {Object} query - The search query from request body
 * @returns {Array} The search results array
 */
export async function executeSearchHook(connection, query) {
  const {
    provider
  } = connection;
  
  const hook = await loadHook(provider, 'search');
  if (!hook) {
    throw new Error(`Search hook not implemented for provider: ${provider}`);
  }
  
  const results = await hook(connection, query);
  return results;
}

/**
 * Execute an import hook if it exists (for resources)
 * @param {Object} connection - The parent connection
 * @param {Object} resource - The created resource (with _id)
 * @returns {Object} The enhanced data object for resource.data
 */
export async function executeImportHook(connection, resource) {

  const {
    provider
  } = connection;

  const hook = await loadHook(provider, 'import');
  if (!hook) {
    return resource.data;
  }
  
  const result = await hook(connection, resource);
  return result;
}

/**
 * 
 * @param {*} connection 
 * @param {*} resource 
 * @param {*} action 
 * @returns 
 */
export async function executeActionHook(job, { log } = {}) {
  const action = job.name;

  const {
    connection,
  } = job.data;

  const {
    provider
  } = connection;

  // Fall back to job.log if no broadcast-capable log callback is provided
  const _log = log || ((msg) => job.log(msg));

  await _log(`Executing action hook '${action}' for provider '${provider}'`);
  
  const hook = await loadHook(provider, `action/${action}`);
  if (!hook) {
    throw new Error(`Action hook '${action}' not implemented for provider: ${provider}`);
  }
  
  await hook(job, { log: _log });

  await _log(`Action hook '${action}' for provider '${provider}' completed successfully`);

  return {
    success: true
  };
}

export async function executeResourceDeleteHook(connection, resource) {
  const {
    provider
  } = connection;
  
  const hook = await loadHook(provider, 'subdelete');
  if (!hook) {
    return;
  }
  
  await hook(connection, resource);
}