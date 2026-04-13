// ─── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function err(msg, status = 400, origin) {
  return json({ ok: false, error: msg }, status, origin);
}

async function makeToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return false;
  const stored = await env.SITE_KV.get(`session:${token}`);
  return stored === 'valid';
}

function toSlug(title, date) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
  const d = date || new Date().toISOString().split('T')[0];
  return `${d}-${slug}`;
}

function buildMarkdown({ title, date, excerpt, tags, content }) {
  const safeStr = (s) => String(s || '').replace(/"/g, '\\"');
  return `---\ntitle: "${safeStr(title)}"\ndate: "${safeStr(date)}"\nexcerpt: "${safeStr(excerpt)}"\ntags: "${safeStr(tags)}"\n---\n\n${content}`;
}

// ─── GitHub file API ─────────────────────────────────────────────────────────

async function githubRequest(env, method, filePath, body) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'my-site',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function getFileSha(env, filePath) {
  const res = await githubRequest(env, 'GET', filePath);
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha || null;
}

async function upsertFile(env, filePath, content, message, sha) {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const body = { message, content: encoded };
  if (sha) body.sha = sha;
  const res = await githubRequest(env, 'PUT', filePath, body);
  return res.ok;
}

async function deleteGithubFile(env, filePath, message, sha) {
  const res = await githubRequest(env, 'DELETE', filePath, { message, sha });
  return res.ok;
}

async function listPosts(env) {
  const res = await githubRequest(env, 'GET', 'src/posts');
  if (!res.ok) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];

  const posts = [];
  for (const f of files.filter(f => f.name.endsWith('.md'))) {
    const slug = f.name.replace('.md', '');
    const cached = await env.SITE_KV.get(`post-meta:${slug}`, 'json');
    if (cached) {
      posts.push(cached);
    } else {
      const parts = slug.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      posts.push({
        slug,
        title: parts ? parts[2].replace(/-/g, ' ') : slug,
        date:  parts ? parts[1] : '',
        excerpt: '',
        tags: '',
      });
    }
  }
  return posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function parsePostFile(raw) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { content: raw };
  const fm = fmMatch[1];
  const content = fmMatch[2].trim();
  const get = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'));
    return m ? m[1] : '';
  };
  return {
    title:   get('title'),
    date:    get('date'),
    excerpt: get('excerpt'),
    tags:    get('tags'),
    content,
  };
}

// ─── Claude AI ───────────────────────────────────────────────────────────────

async function generateLinkedInPost(env, { title, excerpt, content, url }) {
  const prompt = `You are writing a LinkedIn post for a tech professional's blog.

Blog post title: "${title}"
Excerpt: "${excerpt}"
Content snippet: "${content.slice(0, 800)}"
Post URL: ${url}

Write a compelling LinkedIn post that:
- Opens with a hook (avoid starting with "I just published...")
- Summarises the key insight in 2-3 sentences
- Ends with the link and 3-5 relevant hashtags
- Feels genuine, not corporate
- Is under 1300 characters total

Respond with ONLY the LinkedIn post text, nothing else.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error('Claude API error');
  const data = await res.json();
  return data.content?.[0]?.text || `${title}\n\n${excerpt}\n\n${url}`;
}

// ─── LinkedIn API ────────────────────────────────────────────────────────────

async function getLinkedInPersonUrn(accessToken) {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get LinkedIn profile');
  const data = await res.json();
  return data.sub;
}

async function readResponseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function postToLinkedIn(accessToken, authorUrn, text, env) {
  const version = env.LINKEDIN_API_VERSION || '202603';
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Linkedin-Version': version,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${authorUrn}`,
      lifecycleState: 'PUBLISHED',
      visibility: 'PUBLIC',
      commentary: text,
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      isReshareDisabledByAuthor: false,
    }),
  });
  const body = await readResponseBody(res);
  return {
    ok: res.ok,
    status: res.status,
    postId: res.headers.get('x-restli-id') || body?.id || null,
    body,
  };
}

// ─── Main fetch handler ──────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {

      // POST /api/auth
      if (pathname === '/api/auth' && method === 'POST') {
        const { password } = await request.json().catch(() => ({}));
        if (!password || password !== env.ADMIN_PASSWORD) {
          return err('Invalid password', 401, origin);
        }
        const token = await makeToken();
        await env.SITE_KV.put(`session:${token}`, 'valid', { expirationTtl: 43200 });
        return json({ ok: true, token }, 200, origin);
      }

      // GET /api/posts
      if (pathname === '/api/posts' && method === 'GET') {
        if (!await verifyToken(request, env)) return err('unauthorized', 401, origin);
        const posts = await listPosts(env);
        return json({ ok: true, posts }, 200, origin);
      }

      // GET /api/post/:slug
      const slugMatch = pathname.match(/^\/api\/post\/(.+)$/);
      if (slugMatch && method === 'GET') {
        if (!await verifyToken(request, env)) return err('unauthorized', 401, origin);
        const slug = slugMatch[1];
        const res = await githubRequest(env, 'GET', `src/posts/${slug}.md`);
        if (!res.ok) return err('Post not found', 404, origin);
        const file = await res.json();
        const raw = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
        const post = { slug, ...parsePostFile(raw) };
        return json({ ok: true, post }, 200, origin);
      }

      // DELETE /api/post/:slug
      if (slugMatch && method === 'DELETE') {
        if (!await verifyToken(request, env)) return err('unauthorized', 401, origin);
        const slug = slugMatch[1];
        const filePath = `src/posts/${slug}.md`;
        const sha = await getFileSha(env, filePath);
        if (!sha) return err('Post not found', 404, origin);
        const ok = await deleteGithubFile(env, filePath, `post: delete ${slug}`, sha);
        if (!ok) return err('Failed to delete from GitHub', 500, origin);
        await env.SITE_KV.delete(`post-meta:${slug}`);
        return json({ ok: true }, 200, origin);
      }

      // POST /api/post (create)
      if (pathname === '/api/post' && method === 'POST') {
        if (!await verifyToken(request, env)) return err('unauthorized', 401, origin);
        const body = await request.json().catch(() => null);
        if (!body?.title || !body?.content) return err('title and content required', 400, origin);

        const date = body.date || new Date().toISOString().split('T')[0];
        const slug = toSlug(body.title, date);
        const md   = buildMarkdown({ ...body, date });

        const ok = await upsertFile(env, `src/posts/${slug}.md`, md, `post: add ${slug}`);
        if (!ok) return err('Failed to write to GitHub', 500, origin);

        await env.SITE_KV.put(`post-meta:${slug}`, JSON.stringify({
          slug, title: body.title, date,
          excerpt: body.excerpt || '', tags: body.tags || '',
        }));

        if (body.postToLinkedIn) {
          let linkedinResult = { ok: false, skipped: true, error: 'LinkedIn not requested' };
          try {
            const token = await env.SITE_KV.get('linkedin:token');
            if (token) {
              const urn     = await env.SITE_KV.get('linkedin:urn');
              const postUrl = `${env.SITE_URL}/posts/${slug}.html`;
              const text    = await generateLinkedInPost(env, { ...body, date, url: postUrl });
              linkedinResult = await postToLinkedIn(token, urn, text, env);
            } else {
              linkedinResult = { ok: false, error: 'LinkedIn not connected' };
            }
          } catch (e) {
            console.error('LinkedIn post failed:', e);
            linkedinResult = { ok: false, error: e.message || 'LinkedIn post failed' };
          }
          return json({ ok: true, slug, linkedin: linkedinResult }, 200, origin);
        }

        return json({ ok: true, slug }, 200, origin);
      }

      // PUT /api/post (edit)
      if (pathname === '/api/post' && method === 'PUT') {
        if (!await verifyToken(request, env)) return err('unauthorized', 401, origin);
        const body = await request.json().catch(() => null);
        if (!body?.slug || !body?.title || !body?.content) {
          return err('slug, title and content required', 400, origin);
        }

        const filePath = `src/posts/${body.slug}.md`;
        const sha = await getFileSha(env, filePath);
        if (!sha) return err('Post not found', 404, origin);

        const date = body.date || new Date().toISOString().split('T')[0];
        const md   = buildMarkdown({ ...body, date });
        const ok   = await upsertFile(env, filePath, md, `post: update ${body.slug}`, sha);
        if (!ok) return err('Failed to update GitHub file', 500, origin);

        await env.SITE_KV.put(`post-meta:${body.slug}`, JSON.stringify({
          slug: body.slug, title: body.title, date,
          excerpt: body.excerpt || '', tags: body.tags || '',
        }));

        return json({ ok: true, slug: body.slug }, 200, origin);
      }

      // POST /api/linkedin-post (public, called from blog post page)
      if (pathname === '/api/linkedin-post' && method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body?.title) return err('title required', 400, origin);

        const token = await env.SITE_KV.get('linkedin:token');
        if (!token) return err('LinkedIn not connected', 503, origin);

        const urn  = await env.SITE_KV.get('linkedin:urn');
        const text = await generateLinkedInPost(env, {
          title: body.title,
          excerpt: body.excerpt || '',
          content: body.excerpt || '',
          url: body.url || env.SITE_URL,
        });
        const result = await postToLinkedIn(token, urn, text, env);
        if (!result.ok) {
          return json({
            ok: false,
            error: 'LinkedIn API error',
            linkedin: result,
          }, 500, origin);
        }
        return json({ ok: true, linkedin: result }, 200, origin);
      }

      // GET /api/linkedin/auth
      if (pathname === '/api/linkedin/auth' && method === 'GET') {
        const state = await makeToken();
        await env.SITE_KV.put(`linkedin:state:${state}`, 'pending', { expirationTtl: 600 });
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: env.LINKEDIN_CLIENT_ID,
          redirect_uri: env.LINKEDIN_REDIRECT_URI,
          state,
          scope: 'openid profile w_member_social',
        });
        return Response.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`, 302);
      }

      // GET /api/linkedin/callback
      if (pathname === '/api/linkedin/callback' && method === 'GET') {
        const code  = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const stored = await env.SITE_KV.get(`linkedin:state:${state}`);
        if (!stored) return new Response('Invalid or expired state', { status: 400 });
        await env.SITE_KV.delete(`linkedin:state:${state}`);

        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: env.LINKEDIN_REDIRECT_URI,
            client_id: env.LINKEDIN_CLIENT_ID,
            client_secret: env.LINKEDIN_CLIENT_SECRET,
          }),
        });

        if (!tokenRes.ok) return new Response('Token exchange failed', { status: 500 });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const urn = await getLinkedInPersonUrn(accessToken);

        // Store token for ~55 days
        await env.SITE_KV.put('linkedin:token', accessToken, { expirationTtl: 4752000 });
        await env.SITE_KV.put('linkedin:urn', urn);

        return new Response(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#0a0a12;color:#e8e6f0;text-align:center;padding-top:4rem">
            <p style="font-size:2rem">✓</p>
            <h2 style="color:#c084fc;margin:.5rem 0">LinkedIn connected!</h2>
            <p style="color:#9b98b0">You can close this tab.</p>
            <script>setTimeout(()=>window.close(),2000)</script>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      return err('Not found', 404, origin);

    } catch (e) {
      console.error('Worker error:', e);
      return err('Internal server error', 500, origin);
    }
  },
};
