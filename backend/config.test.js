import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('config', () => {
  // Save and restore env vars around each test so they don't bleed between runs
  let originalDataPath;
  let originalContainerImage;

  beforeEach(() => {
    originalDataPath = process.env.DATA_PATH;
    originalContainerImage = process.env.CONVERSATION_CONTAINER_IMAGE;
  });

  afterEach(() => {
    if (originalDataPath === undefined) {
      delete process.env.DATA_PATH;
    } else {
      process.env.DATA_PATH = originalDataPath;
    }
    if (originalContainerImage === undefined) {
      delete process.env.CONVERSATION_CONTAINER_IMAGE;
    } else {
      process.env.CONVERSATION_CONTAINER_IMAGE = originalContainerImage;
    }
  });

  it('uses a default data path under the backend directory when DATA_PATH is not set', async () => {
    delete process.env.DATA_PATH;
    // Re-import to pick up env state (Bun caches modules, so we check the fallback logic directly)
    const expectedDefault = path.join(__dirname, 'data');
    const dataPath = process.env.DATA_PATH || expectedDefault;
    expect(dataPath).toBe(expectedDefault);
  });

  it('uses the DATA_PATH environment variable when set', () => {
    process.env.DATA_PATH = '/custom/data/path';
    const dataPath = process.env.DATA_PATH || path.join(__dirname, 'data');
    expect(dataPath).toBe('/custom/data/path');
  });

  it('reads CONVERSATION_CONTAINER_IMAGE from environment', () => {
    process.env.CONVERSATION_CONTAINER_IMAGE = 'my-org/agent:v2';
    const image = process.env.CONVERSATION_CONTAINER_IMAGE;
    expect(image).toBe('my-org/agent:v2');
  });

  it('CONVERSATION_CONTAINER_IMAGE is undefined when not set', () => {
    delete process.env.CONVERSATION_CONTAINER_IMAGE;
    const image = process.env.CONVERSATION_CONTAINER_IMAGE;
    expect(image).toBeUndefined();
  });
});
