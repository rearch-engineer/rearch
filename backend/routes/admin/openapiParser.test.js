import { describe, it, expect } from 'bun:test';
import { parseOpenApiSpec, loadSpec, deriveBaseUrl } from '../../utils/mcp/openapiParser.js';
import { suggestCuration } from '../../utils/mcp/openapiAiCuration.js';

const openapi3 = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Pet Store', version: '2.1' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/pets/{id}': {
      parameters: [{ name: 'trace', in: 'header', schema: { type: 'string' } }],
      get: {
        operationId: 'getPet',
        summary: 'Get a pet',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'verbose', in: 'query', schema: { type: 'boolean' }, description: 'verbose flag' },
        ],
      },
    },
    '/pets': {
      post: {
        operationId: 'createPet',
        summary: 'Create a pet',
        requestBody: {
          content: {
            'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } },
          },
        },
      },
    },
  },
});

describe('openapiParser.parseOpenApiSpec (OpenAPI 3.x)', () => {
  it('extracts the base URL, info and operations', () => {
    const r = parseOpenApiSpec(openapi3);
    expect(r.info.title).toBe('Pet Store');
    expect(r.info.version).toBe('2.1');
    expect(r.defaultBaseUrl).toBe('https://api.example.com/v1');
    expect(r.operations).toHaveLength(2);
  });

  it('merges path-level and operation-level parameters', () => {
    const r = parseOpenApiSpec(openapi3);
    const getPet = r.operations.find((o) => o.toolName === 'getPet');
    const names = getPet.parameters.map((p) => p.name).sort();
    expect(names).toEqual(['id', 'trace', 'verbose']);
    const id = getPet.parameters.find((p) => p.name === 'id');
    expect(id.in).toBe('path');
    expect(id.required).toBe(true);
    expect(id.type).toBe('string');
    const verbose = getPet.parameters.find((p) => p.name === 'verbose');
    expect(verbose.type).toBe('boolean');
    expect(verbose.description).toBe('verbose flag');
  });

  it('captures request body schema for POST', () => {
    const r = parseOpenApiSpec(openapi3);
    const createPet = r.operations.find((o) => o.toolName === 'createPet');
    expect(createPet.method).toBe('POST');
    expect(createPet.requestBodySchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });

  it('defaults enabled to true and derives a tool name when operationId missing', () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'X', version: '1' },
      servers: [{ url: 'https://x.test' }],
      paths: { '/a/{b}': { get: { summary: 'a' } } },
    });
    const r = parseOpenApiSpec(spec);
    expect(r.operations[0].enabled).toBe(true);
    expect(r.operations[0].toolName).toMatch(/^[a-zA-Z0-9_]+$/);
  });
});

describe('openapiParser (Swagger 2.0)', () => {
  const swagger2 = JSON.stringify({
    swagger: '2.0',
    info: { title: 'Legacy', version: '1.0' },
    host: 'legacy.example.com',
    basePath: '/api',
    schemes: ['https'],
    paths: {
      '/users': {
        get: {
          operationId: 'listUsers',
          parameters: [{ name: 'limit', in: 'query', type: 'integer' }],
        },
      },
    },
  });

  it('derives base URL from scheme/host/basePath', () => {
    expect(deriveBaseUrl(loadSpec(swagger2))).toBe('https://legacy.example.com/api');
  });

  it('parses swagger 2.0 inline parameter types', () => {
    const r = parseOpenApiSpec(swagger2);
    const op = r.operations[0];
    expect(op.toolName).toBe('listUsers');
    expect(op.parameters[0]).toMatchObject({ name: 'limit', in: 'query', type: 'integer' });
  });
});

describe('openapiParser error handling', () => {
  it('rejects empty input', () => {
    expect(() => parseOpenApiSpec('')).toThrow();
  });

  it('rejects non-OpenAPI documents', () => {
    expect(() => parseOpenApiSpec(JSON.stringify({ foo: 'bar' }))).toThrow(/Unsupported/);
  });

  it('parses YAML specs', () => {
    const yaml = [
      'openapi: 3.0.0',
      'info:',
      '  title: YamlApi',
      '  version: "1"',
      'servers:',
      '  - url: https://yaml.test',
      'paths:',
      '  /ping:',
      '    get:',
      '      operationId: ping',
    ].join('\n');
    const r = parseOpenApiSpec(yaml);
    expect(r.info.title).toBe('YamlApi');
    expect(r.operations[0].toolName).toBe('ping');
  });
});

describe('openapiAiCuration.suggestCuration (placeholder)', () => {
  it('is a pass-through when aiCurate is false', async () => {
    const ops = [{ toolName: 'a', method: 'GET', path: '/a' }];
    const res = await suggestCuration(ops, {}, { aiCurate: false });
    expect(res.aiApplied).toBe(false);
    expect(res.operations).toBe(ops);
  });

  it('degrades gracefully (no AI yet) when aiCurate is true', async () => {
    const ops = [{ toolName: 'a', method: 'GET', path: '/a' }];
    const res = await suggestCuration(ops, {}, { aiCurate: true });
    expect(res.aiApplied).toBe(false);
    expect(res.operations).toEqual(ops);
  });
});
