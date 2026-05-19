import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const frontendBaseUrl = 'http://localhost:3001';
const backendBaseUrl = 'http://localhost:8000';
const debugPort = 9225;
const viewport = { width: 1440, height: 1000, scale: 1 };
const runStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const outputDir = path.join(rootDir, 'site-captures', runStamp);
const screenshotDir = path.join(outputDir, 'screenshots');
const chromeUserDir = path.join(outputDir, 'chrome-profile');

fs.mkdirSync(screenshotDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method ?? 'GET' }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Chrome or Edge executable was not found.');
  }
  return found;
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => this.handleMessage(event));
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ''}`));
      } else {
        resolve(message.result);
      }
      return;
    }

    if (message.method && this.listeners.has(message.method)) {
      for (const listener of this.listeners.get(message.method)) {
        listener(message.params ?? {});
      }
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }
      }, 30000);
    });
    this.ws.send(payload);
    return promise;
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(method) ?? new Set();
      const timer = setTimeout(() => {
        listeners.delete(handler);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        listeners.delete(handler);
        resolve(params);
      };
      listeners.add(handler);
      this.listeners.set(method, listeners);
    });
  }

  close() {
    this.ws.close();
  }
}

function sqliteValue(query) {
  try {
    const result = execFileSync('sqlite3', ['backend\\tenaforge.db', query], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return result.split(/\r?\n/).find(Boolean) ?? '';
  } catch {
    return '';
  }
}

function discoverIds() {
  return {
    problemId: sqliteValue('select id from problems order by created_at desc limit 1;'),
    reviewBatchId: sqliteValue(
      'select source_batch_id from problems where source_batch_id is not null order by created_at desc limit 1;',
    ),
    problemSetId: sqliteValue('select id from problem_sets order by created_at desc limit 1;'),
    templateId: sqliteValue('select id from exam_templates order by updated_at desc limit 1;'),
    listingId: sqliteValue('select id from marketplace_listings order by created_at desc limit 1;'),
    creatorSlug: sqliteValue('select slug from creator_profiles order by created_at desc limit 1;'),
  };
}

function safeName(index, slug) {
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return `${String(index).padStart(3, '0')}-${clean || 'screen'}.png`;
}

async function waitForSettledPage(cdp) {
  await cdp
    .send('Runtime.evaluate', {
      expression: "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true",
      awaitPromise: true,
      returnByValue: true,
    })
    .catch(() => {});
  await sleep(1400);
}

async function navigate(cdp, route) {
  const url = route.startsWith('http') ? route : `${frontendBaseUrl}${route}`;
  const loadPromise = cdp.once('Page.loadEventFired', 20000).catch(() => null);
  await cdp.send('Page.navigate', { url });
  await loadPromise;
  await waitForSettledPage(cdp);
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  return result.result?.value;
}

async function capture(cdp, index, slug, title, manifest, extra = {}) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const filename = safeName(index, slug);
  const absolutePath = path.join(screenshotDir, filename);
  fs.writeFileSync(absolutePath, Buffer.from(result.data, 'base64'));
  manifest.push({
    index,
    title,
    route: extra.route ?? '',
    file: `screenshots/${filename}`,
    notes: extra.notes ?? '',
  });
  console.log(`${filename}  ${title}`);
}

async function login(cdp) {
  await navigate(cdp, '/login');
  const loginResult = await evaluate(
    cdp,
    `fetch(${JSON.stringify(`${backendBaseUrl}/api/auth/login`)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: 'admin@tenaforge.com',
        password: 'AdminTest!2026',
        remember: true
      })
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, status: response.status, data };
      document.cookie = 'tf_logged_in=1; path=/; SameSite=Strict';
      localStorage.setItem('tena-auth-profile', JSON.stringify(data.academy || data.user || {}));
      window.dispatchEvent(new Event('tena-auth-changed'));
      return {
        ok: true,
        status: response.status,
        accessToken: data.access_token,
        profile: data.academy || data.user || {},
        email: (data.academy || data.user || {}).email
      };
    })`,
  );
  if (!loginResult?.ok) {
    throw new Error(`Login failed: ${JSON.stringify(loginResult)}`);
  }
  return loginResult;
}

function authPreloadSource(accessToken, profile) {
  return `(() => {
    const token = ${JSON.stringify(accessToken)};
    const profile = ${JSON.stringify(profile ?? {})};
    const apiBase = ${JSON.stringify(backendBaseUrl)};

    function isApiUrl(value) {
      const url = String(value || '');
      return url.startsWith('/api/') || url.startsWith(apiBase + '/api/');
    }

    function applyBrowserAuthState() {
      try {
        document.cookie = 'tf_logged_in=1; path=/; SameSite=Strict';
        localStorage.setItem('tena-auth-profile', JSON.stringify(profile));
        window.dispatchEvent(new Event('tena-auth-changed'));
      } catch {}
    }

    applyBrowserAuthState();

    const originalFetch = window.fetch;
    window.fetch = function captureFetch(input, init) {
      const url = typeof input === 'string' ? input : input && input.url;
      if (isApiUrl(url)) {
        const nextInit = { ...(init || {}) };
        const existingHeaders = nextInit.headers || (input instanceof Request ? input.headers : undefined);
        const headers = new Headers(existingHeaders || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        if (!headers.has('X-Requested-With')) headers.set('X-Requested-With', 'XMLHttpRequest');
        nextInit.headers = headers;
        nextInit.credentials = 'include';
        return originalFetch.call(this, input, nextInit);
      }
      return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function captureOpen(method, url, ...rest) {
      this.__tenaCaptureUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function captureSend(body) {
      if (isApiUrl(this.__tenaCaptureUrl)) {
        try {
          this.setRequestHeader('Authorization', 'Bearer ' + token);
          this.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        } catch {}
      }
      return originalSend.call(this, body);
    };
  })();`;
}

async function installCaptureAuth(cdp, loginResult) {
  const source = authPreloadSource(loginResult.accessToken, loginResult.profile);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
  await evaluate(cdp, source, false);
}

async function applyAuthState(cdp, loginResult) {
  await evaluate(
    cdp,
    `(() => {
      try {
        document.cookie = 'tf_logged_in=1; path=/; SameSite=Strict';
        localStorage.setItem('tena-auth-profile', JSON.stringify(${JSON.stringify(loginResult.profile ?? {})}));
        window.dispatchEvent(new Event('tena-auth-changed'));
        return true;
      } catch {
        return false;
      }
    })()`,
  ).catch(() => false);
  await sleep(350);
}

async function clickByText(cdp, text) {
  return evaluate(
    cdp,
    `(() => {
      const target = Array.from(document.querySelectorAll('button, a, [role="button"], summary, label'))
        .find((el) => (el.innerText || el.textContent || '').trim().includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return true;
    })()`,
  );
}

async function clickFirst(cdp, selector) {
  return evaluate(
    cdp,
    `(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return false;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return true;
    })()`,
  );
}

function buildScreens(ids) {
  const publicScreens = [
    ['public-home', '/', '홈'],
    ['public-login', '/login', '로그인'],
    ['public-register', '/register', '회원가입'],
    ['public-forgot-password', '/forgot-password', '비밀번호 찾기'],
    ['public-reset-password', '/reset-password', '비밀번호 재설정'],
    ['public-verify-email', '/verify-email', '이메일 인증'],
    ['public-pricing', '/pricing', '요금제 안내'],
    ['public-terms', '/terms', '이용약관'],
    ['public-privacy', '/privacy', '개인정보 처리방침'],
    ['public-copyright-policy', '/copyright-policy', '저작권 정책'],
    ['public-checkout-review', '/checkout/review?plan=pro&billing=monthly', '결제 검토'],
    ['public-checkout-success', '/checkout/success', '결제 성공'],
    ['public-checkout-fail', '/checkout/fail', '결제 실패'],
  ];

  const protectedScreens = [
    ['protected-academy-dashboard', '/academy', '학원 대시보드'],
    ['protected-academy-operations', '/academy?panel=operations', '학원 운영 패널'],
    ['protected-academy-seats', '/academy?panel=seats', '좌석/계정 패널'],
    ['protected-academy-classes', '/academy?panel=classes', '클래스 패널'],
    ['protected-student', '/student', '학생 화면'],
    ['protected-upload', '/upload', '문항 업로드'],
    ['protected-batches', '/batches', '업로드 배치'],
    ['protected-problems', '/problems', '문항 목록'],
    ['protected-problems-needs-review', '/problems?needs_review=true', '검토 필요 문항 목록'],
    [
      'protected-problems-review',
      ids.reviewBatchId ? `/problems/review?batch_id=${ids.reviewBatchId}` : '/problems/review',
      '배치별 검토 문항',
    ],
    ['protected-archive-new', '/archive/new', '아카이브 생성'],
    ['protected-problem-sets', '/problem-sets', '문제 세트'],
    ['protected-marketplace', '/marketplace', '마켓플레이스'],
    ['protected-marketplace-books', '/marketplace/books', '교재 마켓'],
    ['protected-marketplace-problem-sets', '/marketplace/problem-sets', '문항 세트 마켓'],
    ['protected-licensed-library', '/licensed-library', '라이선스 라이브러리'],
    ['protected-licensed-library-active', '/licensed-library/active', '활성 라이선스'],
    ['protected-licensed-library-expired', '/licensed-library/expired', '만료 라이선스'],
    ['protected-purchases', '/purchases', '구매 내역'],
    ['protected-plan', '/plan', '구독 플랜'],
    ['protected-plan-basic', '/plan/basic', '베이직 플랜'],
    ['protected-plan-pro', '/plan/pro', '프로 플랜'],
    ['protected-billing', '/billing', '결제/청구'],
    ['protected-settings', '/settings', '설정'],
    ['protected-account-profile', '/account/profile', '계정 프로필'],
    ['protected-account-security', '/account/security', '계정 보안'],
    ['protected-account-rights-policy', '/account/rights-policy', '권한 정책'],
    ['protected-admin-announcements', '/admin/announcements', '관리자 공지'],
    ['protected-admin-saas', '/admin/saas', 'SaaS 관리'],
    ['protected-creator-apply', '/creator/apply', '크리에이터 신청'],
    ['protected-creator-products', '/creator/products', '크리에이터 상품'],
    ['protected-templates', '/templates', '템플릿'],
    ['protected-templates-mine', '/templates/mine', '내 템플릿'],
    ['protected-templates-new', '/templates/new', '새 템플릿'],
    ['protected-templates-studio', '/templates/studio', '템플릿 스튜디오'],
    ['protected-templates-legacy-new', '/templates/legacy/new', '레거시 템플릿 생성'],
    ['protected-templates-editor', '/templates/editor', '템플릿 에디터'],
    ['protected-stores', '/stores', '스토어 목록'],
  ];

  if (ids.problemId) {
    protectedScreens.push(['protected-problem-detail', `/problems/${ids.problemId}`, '문항 상세']);
  }
  if (ids.problemSetId) {
    protectedScreens.push(['protected-problem-set-detail', `/problem-sets/${ids.problemSetId}`, '문제 세트 상세']);
  }
  if (ids.templateId) {
    protectedScreens.push(['protected-template-detail', `/templates/${ids.templateId}`, '템플릿 상세']);
    protectedScreens.push(['protected-template-edit', `/templates/${ids.templateId}/edit`, '템플릿 편집']);
    protectedScreens.push(['protected-template-editor-detail', `/templates/editor/${ids.templateId}`, '템플릿 에디터 상세']);
  }
  if (ids.listingId) {
    protectedScreens.push(['protected-marketplace-listing-detail', `/marketplace/listings/${ids.listingId}`, '마켓 상품 상세']);
  }
  if (ids.creatorSlug) {
    protectedScreens.push(['protected-store-detail', `/stores/${ids.creatorSlug}`, '스토어 상세']);
  }

  return { publicScreens, protectedScreens };
}

function buildInteractions(ids) {
  return [
    {
      slug: 'interaction-account-menu',
      route: '/academy',
      title: '상단 계정 메뉴 열림',
      action: async (cdp) => {
        await evaluate(
          cdp,
          `(() => {
            const buttons = Array.from(document.querySelectorAll('header button'));
            const target = buttons.find((button) => {
              const text = button.innerText || button.textContent || '';
              return text.includes('@') || text.includes('AD') || text.includes('관리');
            }) || buttons.at(-1);
            if (!target) return false;
            target.click();
            return true;
          })()`,
        );
      },
    },
    {
      slug: 'interaction-theme-toggle',
      route: '/academy',
      title: '상단 테마 토글 후 화면',
      action: async (cdp) => {
        await clickFirst(cdp, '.theme-toggle-button');
      },
    },
    {
      slug: 'interaction-sidebar-collapsed',
      route: '/academy',
      title: '사이드바 접힘 상태',
      action: async (cdp) => {
        await evaluate(
          cdp,
          `(() => {
            const buttons = Array.from(document.querySelectorAll('header button'));
            const target = buttons.find((button) => (button.getAttribute('aria-label') || '').includes('사이드바')) || buttons[0];
            if (!target) return false;
            target.click();
            return true;
          })()`,
        );
      },
    },
    {
      slug: 'interaction-batch-detail-open',
      route: '/batches',
      title: '배치 상세 선택 상태',
      action: async (cdp) => {
        const clicked = await clickByText(cdp, '상세');
        if (!clicked) await clickByText(cdp, '보기');
      },
    },
    {
      slug: 'interaction-review-batch-selector',
      route: ids.reviewBatchId ? `/problems/review?batch_id=${ids.reviewBatchId}` : '/problems/review',
      title: '검토 화면 배치 선택 영역',
      action: async (cdp) => {
        await evaluate(
          cdp,
          `(() => {
            const target = Array.from(document.querySelectorAll('button, label, input'))
              .find((el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').includes('검토 대기'));
            if (!target) return false;
            target.click();
            return true;
          })()`,
        );
      },
    },
    {
      slug: 'interaction-template-editor-text-tab',
      route: '/templates/editor',
      title: '템플릿 에디터 텍스트 패널',
      action: async (cdp) => {
        const clicked = await clickByText(cdp, '텍스트');
        if (!clicked) await clickByText(cdp, 'Text');
      },
    },
    {
      slug: 'interaction-template-editor-tools-tab',
      route: '/templates/editor',
      title: '템플릿 에디터 도구 패널',
      action: async (cdp) => {
        const clicked = await clickByText(cdp, '도구');
        if (!clicked) await clickByText(cdp, 'Tools');
      },
    },
    {
      slug: 'interaction-template-editor-zoom-menu',
      route: '/templates/editor',
      title: '템플릿 에디터 확대/축소 컨트롤',
      action: async (cdp) => {
        await evaluate(
          cdp,
          `(() => {
            const controls = Array.from(document.querySelectorAll('button, select'));
            const target = controls.find((el) => (el.innerText || el.textContent || '').includes('%')) || controls.find((el) => (el.getAttribute('aria-label') || '').toLowerCase().includes('zoom'));
            if (!target) return false;
            target.click();
            return true;
          })()`,
        );
      },
    },
  ];
}

async function main() {
  const ids = discoverIds();
  const { publicScreens, protectedScreens } = buildScreens(ids);
  const interactions = buildInteractions(ids);
  const manifest = [];
  const chromePath = findChrome();
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeUserDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    let targets = await requestJson(`http://127.0.0.1:${debugPort}/json/list`);
    if (!targets.some((target) => target.type === 'page')) {
      try {
        await requestJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
      } catch {
        await requestJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`);
      }
      targets = await requestJson(`http://127.0.0.1:${debugPort}/json/list`);
    }
    const pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    if (!pageTarget) throw new Error('No debuggable page target found.');

    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.scale,
      mobile: false,
    });

    let index = 1;
    for (const [slug, route, title] of publicScreens) {
      await navigate(cdp, route);
      await capture(cdp, index++, slug, title, manifest, { route });
    }

    const loginResult = await login(cdp);
    await installCaptureAuth(cdp, loginResult);

    for (const [slug, route, title] of protectedScreens) {
      await navigate(cdp, route);
      await applyAuthState(cdp, loginResult);
      await capture(cdp, index++, slug, title, manifest, { route });
    }

    for (const interaction of interactions) {
      await navigate(cdp, interaction.route);
      await applyAuthState(cdp, loginResult);
      await interaction.action(cdp);
      await sleep(900);
      await capture(cdp, index++, interaction.slug, interaction.title, manifest, {
        route: interaction.route,
        notes: 'Representative clicked/open UI state',
      });
    }
  } finally {
    cdp?.close();
    chrome.kill();
  }

  const readmeLines = [
    '# Tena Forge Site Captures',
    '',
    `Captured at: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    `Frontend: ${frontendBaseUrl}`,
    `Backend: ${backendBaseUrl}`,
    '',
    '## Files',
    '',
    ...manifest.map((entry) => `- ${entry.file} - ${entry.title}${entry.route ? ` (${entry.route})` : ''}`),
    '',
  ];
  fs.writeFileSync(path.join(outputDir, 'README.md'), readmeLines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nSaved ${manifest.length} screenshots to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
