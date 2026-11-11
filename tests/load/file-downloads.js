/**
 * k6 load scenario: file downloads under parallel load, while other clients give up.
 *
 * What it guards against: a download path that leaks a store connection whenever a client aborts.
 * With S3 every download holds one socket of the S3 client's pool until its body is read or
 * destroyed. A route that pipes the body with a bare `stream.pipe(res)` never destroys it when
 * the client leaves, and a client that gives up while still WAITING for a socket left one behind
 * too (nest-server before 12.8.9). Each aborted download then keeps a socket for good; once the
 * pool is empty every further download hangs, while `/health-check` stays green. Under load this
 * becomes an avalanche: slow downloads make more clients give up, and each one leaks the next
 * socket. That only shows when aborts happen DURING parallel load, which is what this runs.
 *
 * Three scenarios, one after the other in part:
 *   downloads  ramping VUs that download complete files and check every byte arrived
 *   aborts     clients that give up after a random 50–1500 ms: some while the request waits,
 *              some in the middle of the body. Runs in parallel to `downloads`.
 *   probes     after both ended: a few complete downloads that must each finish within 10 s.
 *              A leaked pool shows here even when the load phase still looked fine.
 *
 * Thresholds: no download hangs (timeout), under 1 % failed and p95 bounded in `downloads`,
 * every probe complete and under 10 s. The server's memory is not visible to k6: watch its RSS
 * during the run (`ps -o rss= -p <pid>`, `docker stats`), and with S3 the log must not show
 * `S3 socket pool exhausted` (nest-server 12.8.9+ logs it as an error once per minute).
 *
 * Run (the API must be running; the account must be allowed to upload and to download — in the
 * starter that is an administrator):
 *
 *   API_BASE_URL=http://localhost:3000 K6_EMAIL=admin@example.com K6_PASSWORD=... \
 *     k6 run tests/load/file-downloads.js
 *
 * Environment (all optional except the credentials or K6_COOKIE):
 *   API_BASE_URL       API origin                                   default http://localhost:3000
 *   K6_EMAIL / K6_PASSWORD   signs in through `POST /iam/sign-in/email`
 *   K6_COOKIE          a ready Cookie header instead of signing in
 *   K6_ORIGIN          Origin header for the sign-in (when the origin check is on: the app URL)
 *   K6_FILE_IDS        comma-separated ids of existing files; skips upload and cleanup
 *   K6_SMALL_KB / K6_LARGE_KB   sizes of the two uploaded test files       default 64 / 4096
 *   K6_VUS             downloading VUs                               default 50
 *   K6_DURATION_S      length of the load phase in seconds           default 180
 *   K6_ABORT_RATE      aborting requests per second                  default 20
 *   K6_DOWNLOAD_TIMEOUT_S   a download slower than this counts as hung    default 30
 *   K6_P95_MS          p95 bound for complete downloads in ms        default 5000
 *
 * Point it at a stage with the same store the project runs on: with GridFS or the filesystem it
 * checks the download path, the pool problem itself only exists with S3.
 */
import { check } from 'k6';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const VUS = Number(__ENV.K6_VUS || 50);
const DURATION_S = Number(__ENV.K6_DURATION_S || 180);
const ABORT_RATE = Number(__ENV.K6_ABORT_RATE || 20);
const DOWNLOAD_TIMEOUT_S = Number(__ENV.K6_DOWNLOAD_TIMEOUT_S || 30);
const P95_MS = Number(__ENV.K6_P95_MS || 5000);
const SMALL_KB = Number(__ENV.K6_SMALL_KB || 64);
const LARGE_KB = Number(__ENV.K6_LARGE_KB || 4096);
const RAMP_S = 20;
const PROBE_TIMEOUT_S = 10;

/** A request k6 gave up on after its timeout (k6 error code 1050). */
const REQUEST_TIMEOUT = 1050;

const hangs = new Counter('download_hangs');
const abortsSent = new Counter('aborts_sent');

export const options = {
  scenarios: {
    downloads: {
      exec: 'download',
      executor: 'ramping-vus',
      stages: [
        { duration: `${RAMP_S}s`, target: VUS },
        { duration: `${DURATION_S}s`, target: VUS },
      ],
    },
    aborts: {
      duration: `${DURATION_S}s`,
      exec: 'abort',
      executor: 'constant-arrival-rate',
      maxVUs: Math.max(50, ABORT_RATE * 4),
      preAllocatedVUs: Math.max(10, ABORT_RATE),
      rate: ABORT_RATE,
      startTime: `${RAMP_S}s`,
      timeUnit: '1s',
    },
    probes: {
      exec: 'probe',
      executor: 'shared-iterations',
      iterations: 10,
      maxDuration: '2m',
      // After the load phase plus the time a running download needs to end.
      startTime: `${RAMP_S + DURATION_S + DOWNLOAD_TIMEOUT_S}s`,
      vus: 2,
    },
  },
  thresholds: {
    'checks{scenario:downloads}': ['rate>0.99'],
    'checks{scenario:probes}': ['rate==1'],
    download_hangs: ['count==0'],
    'http_req_duration{scenario:downloads}': [`p(95)<${P95_MS}`],
    'http_req_duration{scenario:probes}': [`max<${PROBE_TIMEOUT_S * 1000}`],
    'http_req_failed{scenario:downloads}': ['rate<0.01'],
  },
};

/** Cookie header of a signed-in session. */
function signIn() {
  if (__ENV.K6_COOKIE) {
    return __ENV.K6_COOKIE;
  }
  if (!__ENV.K6_EMAIL || !__ENV.K6_PASSWORD) {
    throw new Error('Set K6_EMAIL and K6_PASSWORD (an account that may upload and download), or K6_COOKIE.');
  }
  const headers = { 'Content-Type': 'application/json' };
  if (__ENV.K6_ORIGIN) {
    headers.Origin = __ENV.K6_ORIGIN;
  }
  const res = http.post(
    `${BASE_URL}/iam/sign-in/email`,
    JSON.stringify({ email: __ENV.K6_EMAIL, password: __ENV.K6_PASSWORD }),
    { headers },
  );
  if (res.status !== 200) {
    throw new Error(`Sign-in failed: HTTP ${res.status} ${String(res.body).slice(0, 200)}`);
  }
  const cookie = Object.entries(res.cookies)
    .flatMap(([name, values]) => values.map((c) => `${name}=${c.value}`))
    .join('; ');
  if (!cookie) {
    throw new Error('Sign-in answered 200 but set no cookie.');
  }
  return cookie;
}

/** Uploads one test file of `kb` KiB and returns its id and size. */
function upload(cookie, name, kb) {
  const size = kb * 1024;
  const res = http.post(
    `${BASE_URL}/files/upload`,
    { file: http.file('k'.repeat(size), name, 'application/octet-stream') },
    { headers: { Cookie: cookie }, timeout: '120s' },
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload of ${name} failed: HTTP ${res.status} ${String(res.body).slice(0, 200)}`);
  }
  const id = res.json('id') || res.json('_id');
  if (!id) {
    throw new Error(`Upload of ${name} answered without an id.`);
  }
  return { id: String(id), size, uploaded: true };
}

export function setup() {
  const cookie = signIn();
  if (__ENV.K6_FILE_IDS) {
    const files = __ENV.K6_FILE_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ id, size: null, uploaded: false }));
    return { cookie, files };
  }
  const stamp = Date.now();
  return {
    cookie,
    files: [upload(cookie, `k6-small-${stamp}.bin`, SMALL_KB), upload(cookie, `k6-large-${stamp}.bin`, LARGE_KB)],
  };
}

export function teardown(data) {
  for (const file of data.files.filter((f) => f.uploaded)) {
    http.del(`${BASE_URL}/files/${file.id}`, null, { headers: { Cookie: data.cookie } });
  }
}

function pick(files) {
  return files[Math.floor(Math.random() * files.length)];
}

/** A complete download: status 200 and, when the size is known, every byte. */
function completeDownload(data, timeoutS) {
  const file = pick(data.files);
  const res = http.get(`${BASE_URL}/files/id/${file.id}`, {
    headers: { Cookie: data.cookie },
    responseType: 'binary',
    tags: { name: 'GET /files/id/:id' },
    timeout: `${timeoutS}s`,
  });
  if (res.error_code === REQUEST_TIMEOUT) {
    hangs.add(1);
  }
  check(res, {
    'download complete': (r) =>
      r.status === 200 && (file.size === null || (r.body !== null && r.body.byteLength === file.size)),
  });
}

export function download(data) {
  completeDownload(data, DOWNLOAD_TIMEOUT_S);
}

/** A client that gives up: while the request still waits, or in the middle of the body. */
export function abort(data) {
  const file = pick(data.files);
  abortsSent.add(1);
  http.get(`${BASE_URL}/files/id/${file.id}`, {
    headers: { Cookie: data.cookie },
    responseType: 'none',
    tags: { name: 'GET /files/id/:id (aborted)' },
    timeout: `${50 + Math.floor(Math.random() * 1450)}ms`,
  });
}

export function probe(data) {
  completeDownload(data, PROBE_TIMEOUT_S);
}
