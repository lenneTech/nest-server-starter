import { TestGraphQLConfig, TestGraphQLOptions, TestGraphQLType, TestHelper } from '@lenne.tech/nest-server';
import { jsonToGraphQLQuery } from 'json-to-graphql-query';
import supertest = require('supertest');

/**
 * Extended graphql options with cookie-based authentication.
 *
 * Mirrors `TestGraphQLOptions` and adds a `cookies` field — the same
 * field the framework already supports on `testHelper.rest()`.
 *
 * Why this exists:
 * `TestHelper.graphQl()` only accepts a Bearer token via the `token` field
 * (Authorization header). Since the project switched to BetterAuth's
 * cookie-based session auth as default, GraphQL tests need to send the
 * session via the `Cookie` header instead.
 */
export interface GraphQlCookieOptions extends TestGraphQLOptions {
  cookies?: Record<string, string> | string;
}

/**
 * Send a GraphQL request authenticated via Cookie instead of Bearer token.
 *
 * The query is built using the same logic as `TestHelper.graphQl()`
 * (jsonToGraphQLQuery + enum auto-conversion) but the actual transport
 * is `testHelper.rest('/graphql', { cookies, payload, ... })` so the
 * framework's existing cookie handling (incl. buildBetterAuthCookies)
 * kicks in.
 *
 * Subscriptions are not supported — they require the WebSocket transport
 * and should keep using `testHelper.graphQl()` directly.
 */
export async function graphQlWithCookie(
  testHelper: TestHelper,
  graphql: string | TestGraphQLConfig,
  options: GraphQlCookieOptions = {},
): Promise<any> {
  const config: GraphQlCookieOptions = {
    convertEnums: true,
    log: false,
    logError: false,
    prepareArguments: true,
    statusCode: 200,
    ...options,
  };

  // Build the query string
  let query = '';
  let name: string | undefined;
  let graphqlConfig: TestGraphQLConfig;

  if (
    (typeof graphql === 'string'
      || (typeof graphql === 'object' && graphql !== null && (graphql as any).constructor === String))
    && /^(?![a-zA-Z]+$).*$/.test((graphql as string).trim())
  ) {
    query = (graphql as string).trim();
  } else {
    if (
      typeof graphql === 'string'
      || (typeof graphql === 'object' && graphql !== null && (graphql as any).constructor === String)
    ) {
      graphqlConfig = { name: (graphql as string).trim() };
    } else {
      graphqlConfig = graphql;
    }
    graphqlConfig = {
      arguments: null,
      fields: [],
      name: null,
      type: TestGraphQLType.QUERY,
      ...graphqlConfig,
    };
    name = graphqlConfig.name;

    const queryObj: Record<string, any> = {};
    queryObj[graphqlConfig.type] = {};
    if (graphqlConfig.variables) {
      queryObj[graphqlConfig.type].__variables = graphqlConfig.variables;
    }
    queryObj[graphqlConfig.type][graphqlConfig.name] = testHelper.prepareFields(graphqlConfig.fields) || {};
    if (graphqlConfig.arguments) {
      queryObj[graphqlConfig.type][graphqlConfig.name].__args = config.prepareArguments
        ? testHelper.prepareArguments(graphqlConfig.arguments)
        : graphqlConfig.arguments;
    }

    const fields = graphqlConfig.fields as unknown[] | undefined;
    if ((!fields || fields.length === 0) && !graphqlConfig.arguments) {
      query = `${graphqlConfig.type} { ${graphqlConfig.name} }`;
    } else {
      query = jsonToGraphQLQuery(queryObj, { pretty: true });
    }
  }

  // Convert UPPERCASE strings in arguments to enums (same logic as TestHelper.graphQl)
  if (config.convertEnums) {
    if (Array.isArray(config.convertEnums)) {
      for (const key of config.convertEnums) {
        const regExp = new RegExp(`(?<=${key}:\\s*)"([A-Z0-9_]+)"(?=\\s*[,\\]}])`, 'g');
        query = query.replace(regExp, (match, group1) => (/^\d+$/.test(group1) ? match : group1));
      }
    } else {
      query = query.replace(/(?<=[:[,]\s*)"([A-Z0-9_]+)"(?=\s*[,\]}])/g, (match, group1) =>
        /^\d+$/.test(group1) ? match : group1);
    }
  }

  // Send request — multipart variant for variables (Apollo upload spec), plain JSON otherwise
  let response: any;
  if (config.variables) {
    response = await sendMultipart(testHelper, query, config);
  } else {
    response = await testHelper.rest('/graphql', {
      cookies: config.cookies,
      headers: config.language ? { 'accept-language': config.language } : undefined,
      method: 'POST',
      payload: { query },
      returnResponse: true,
      statusCode: config.statusCode ?? 200,
    });
  }

  // Parse response (same logic as TestHelper.graphQl)
  if (response.body) {
    if (response.body.data) {
      return name ? response.body.data[name] : response.body.data;
    }
    return response.body;
  }
  if (response.text) {
    const parsed = JSON.parse(response.text);
    if (parsed.data) {
      return name ? parsed.data[name] : parsed.data;
    }
    return parsed;
  }
  return undefined;
}

/**
 * Build a multipart GraphQL upload request (Apollo upload spec) with cookie auth.
 * Mirrors `TestHelper.processVariables` but lets us inject the Cookie header.
 */
async function sendMultipart(
  testHelper: TestHelper,
  query: string,
  config: GraphQlCookieOptions,
): Promise<any> {
  const variables = config.variables;

  // Flatten variables — attachments arrays produce one entry per file
  const mapArray: { index?: number; key: string; type: 'attachment' | 'field'; value: any }[] = [];
  for (const [key, item] of Object.entries(variables)) {
    if (item.type === 'attachment' && Array.isArray(item.value)) {
      item.value.forEach((element, index) => {
        mapArray.push({ index, key, type: 'attachment', value: element });
      });
    } else {
      mapArray.push({ key, type: item.type, value: item.value });
    }
  }
  const map: Record<string, string[]> = {};
  mapArray.forEach((item, index) => {
    map[index] = [`variables.${item.key}${'index' in item ? `.${item.index}` : ''}`];
  });

  const request = supertest(testHelper.app.getHttpServer())
    .post('/graphql')
    .field('operations', JSON.stringify({ query }))
    .field('map', JSON.stringify(map));

  // Cookie header (use TestHelper's buildBetterAuthCookies for plain session tokens)
  if (config.cookies) {
    let cookieString: string;
    if (typeof config.cookies === 'string') {
      if (!config.cookies.includes('=') && !config.cookies.includes(';')) {
        const cookieRecord = TestHelper.buildBetterAuthCookies(config.cookies);
        cookieString = Object.entries(cookieRecord)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
      } else {
        cookieString = config.cookies;
      }
    } else {
      cookieString = Object.entries(config.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }
    request.set('Cookie', cookieString);
  }

  if (config.language) {
    request.set('accept-language', config.language);
  }

  // Attach files / set fields per spec
  mapArray.forEach((variable, i) => {
    if (variable.type === 'attachment') {
      request.set('Apollo-Require-Preflight', 'true');
      if (typeof variable.value === 'object' && variable.value.file) {
        request.attach(`${i}`, variable.value.file, variable.value.options);
      } else {
        request.attach(`${i}`, variable.value);
      }
    } else {
      request.field(`${i}`, variable.value);
    }
  });

  const response: any = await request;
  if (config.statusCode !== undefined && config.statusCode !== null) {
    expect(response.statusCode).toBe(config.statusCode);
  }
  return response;
}
