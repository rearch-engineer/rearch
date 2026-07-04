import { describe, it, expect, afterEach } from 'bun:test';
import { buildOpenApiTools, callOpenApiTool } from './openapi-tools.js';

const cfg = {
  type: 'openapi',
  baseUrl: 'https://api.example.com/v1/',
  headers: { Authorization: 'Bearer secret' },
  operations: [
    {
      toolName: 'getPet',
      method: 'GET',
      path: '/pets/{id}',
      description: 'Get a pet',
      enabled: true,
      parameters: [
        { name: 'id', in: 'path', required: true, type: 'string' },
        { name: 'verbose', in: 'query', type: 'boolean', description: 'verbose flag' },
        { name: 'X-Trace', in: 'header', type: 'string' },
      ],
    },
    {
      toolName: 'createPet',
      method: 'POST',
      path: '/pets',
      enabled: true,
      parameters: [],
      requestBodySchema: { type: 'object', properties: { name: { type: 'string' } } },
    },
    {
      toolName: 'hidden',
      method: 'GET',
      path: '/secret',
      enabled: false,
      parameters: [],
    },
  ],
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('buildOpenApiTools', () => {
  it('builds tools only for enabled operations', () => {
    const tools = buildOpenApiTools('petstore', cfg);
    expect(tools.map((t) => t.name).sort()).toEqual(['createPet', 'getPet']);
  });

  it('synthesizes an input schema from parameters', () => {
    const tools = buildOpenApiTools('petstore', cfg);
    const getPet = tools.find((t) => t.name === 'getPet');
    expect(getPet.inputSchema.type).toBe('object');
    expect(getPet.inputSchema.required).toEqual(['id']);
    expect(getPet.inputSchema.properties.verbose.type).toBe('boolean');
  });

  it('adds a required body property when requestBodySchema is present', () => {
    const tools = buildOpenApiTools('petstore', cfg);
    const createPet = tools.find((t) => t.name === 'createPet');
    expect(createPet.inputSchema.required).toContain('body');
    expect(createPet.inputSchema.properties.body.type).toBe('object');
  });

  it('attaches the operation descriptor for routing', () => {
    const tools = buildOpenApiTools('petstore', cfg);
    expect(tools[0]._operation).toBeDefined();
  });
});

describe('callOpenApiTool', () => {
  it('substitutes path params, sets query + header params and injects auth headers', async () => {
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, statusText: 'OK', text: async () => '{"id":"42"}' };
    };

    const op = cfg.operations[0];
    const res = await callOpenApiTool(cfg, op, { id: '42', verbose: true, 'X-Trace': 'abc' });

    expect(captured.url).toBe('https://api.example.com/v1/pets/42?verbose=true');
    expect(captured.init.method).toBe('GET');
    expect(captured.init.headers.Authorization).toBe('Bearer secret');
    expect(captured.init.headers['X-Trace']).toBe('abc');
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toContain('HTTP 200 OK');
    expect(res.content[0].text).toContain('{"id":"42"}');
  });

  it('sends a JSON body for operations with a request body', async () => {
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 201, statusText: 'Created', text: async () => 'ok' };
    };

    const op = cfg.operations[1];
    await callOpenApiTool(cfg, op, { body: { name: 'rex' } });

    expect(captured.url).toBe('https://api.example.com/v1/pets');
    expect(captured.init.method).toBe('POST');
    expect(captured.init.headers['Content-Type']).toBe('application/json');
    expect(captured.init.body).toBe('{"name":"rex"}');
  });

  it('returns an error result when a required parameter is missing', async () => {
    const op = cfg.operations[0];
    const res = await callOpenApiTool(cfg, op, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Missing required parameter "id"');
  });

  it('marks non-2xx responses as errors', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => 'nope' });
    const op = cfg.operations[0];
    const res = await callOpenApiTool(cfg, op, { id: '99' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('HTTP 404');
  });

  it('surfaces network failures as error results', async () => {
    globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
    const op = cfg.operations[0];
    const res = await callOpenApiTool(cfg, op, { id: '1' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Request failed');
  });
});
