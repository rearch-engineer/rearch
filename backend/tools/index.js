import * as weather from './weather/index.js';
import * as file from './file/index.js';
import * as bitbucket from './bitbucket/index.js';

// Flatten all tool methods from all modules into a single tools object
const tools = {
  // Extract only the tool functions (not metadata)
  ...Object.fromEntries(
    Object.entries(weather).filter(([key]) => key !== 'metadata')
  ),
  ...Object.fromEntries(
    Object.entries(file).filter(([key]) => key !== 'metadata')
  ),
  ...Object.fromEntries(
    Object.entries(bitbucket).filter(([key]) => key !== 'metadata')
  ),
};

// Export metadata separately for the /tools route
export const toolsMetadata = [
  weather.metadata,
  file.metadata,
  bitbucket.metadata,
];

export default tools;
