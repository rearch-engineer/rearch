/**
 * Hook Loader Utility
 * Dynamically loads hooks for resource lifecycle events
 */

/**
 * Load a hook for a specific provider and hook type
 * @param {string} provider - The resource provider (e.g., 'bitbucket', 'file')
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
 * @param {Object} resource - The created resource (with _id)
 * @returns {Object} The hook result or the original resource data
 */
export async function executeCreateHook(resource) {
  const hook = await loadHook(resource.provider, 'create');
  if (!hook) {
    return resource.data;
  }
  
  const result = await hook({resource});
  return result;
}

/**
 * Execute an update hook if it exists
 * @param {string} provider - The resource provider
 * @param {Object} originalResource - The resource before update
 * @param {Object} updatedResource - The resource after update
 * @returns {Object} The hook result or the updated resource data
 */
export async function executeUpdateHook(provider, originalResource, updatedResource) {
  const hook = await loadHook(provider, 'update');
  if (!hook) {
    return updatedResource.data;
  }
  
  const result = await hook(originalResource, updatedResource);
  return result;
}

/**
 * Execute a delete hook if it exists
 * @param {string} provider - The resource provider
 * @param {Object} resource - The resource being deleted
 * @returns {void}
 */
export async function executeDeleteHook(provider, resource) {
  const hook = await loadHook(provider, 'delete');
  if (!hook) {
    return;
  }
  
  await hook(resource);
}

/**
 * Execute a search hook if it exists (for subresources)
 * @param {Object} parentResource - The parent resource
 * @param {Object} query - The search query from request body
 * @returns {Array} The search results array
 */
export async function executeSearchHook(parentResource, query) {
  const {
    provider
  } = parentResource;
  
  const hook = await loadHook(provider, 'search');
  if (!hook) {
    throw new Error(`Search hook not implemented for provider: ${provider}`);
  }
  
  const results = await hook(parentResource, query);
  return results;
}

/**
 * Execute an import hook if it exists (for subresources)
 * @param {Object} parentResource - The parent resource
 * @param {Object} subresource - The created subresource (with _id)
 * @returns {Object} The enhanced data object for subresource.data
 */
export async function executeImportHook(parentResource, subresource) {

  const {
    provider
  } = parentResource;

  const hook = await loadHook(provider, 'import');
  if (!hook) {
    return subresource.data;
  }
  
  const result = await hook(parentResource, subresource);
  return result;
}

/**
 * 
 * @param {*} parentResource 
 * @param {*} subresource 
 * @param {*} action 
 * @returns 
 */
export async function executeActionHook(job, { log } = {}) {
  const action = job.name;

  const {
    parentResource,
  } = job.data;

  const {
    provider
  } = parentResource;

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

export async function executeSubDeleteHook(parentResource, subresource) {
  const {
    provider
  } = parentResource;
  
  const hook = await loadHook(provider, 'subdelete');
  if (!hook) {
    return;
  }
  
  await hook(parentResource, subresource);
}