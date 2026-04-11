#!/usr/bin/env node
/**
 * build.js — Static site generator
 * Reads src/posts/*.md → generates dist/ with full HTML site
 *
 * Usage:  node build.js
 */

import {marked} from "marked";
import matter from "gray-matter";
import fse from "fs-extra";
import path from "path";
import {fileURLToPath} from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
  SITE_NAME: "Arnaldo",
  FIRST_NAME: "Arnaldo",
  LAST_NAME: "Koo",
  SITE_TITLE: "Developer & Consultant",
  SITE_ROLE: "NetSuite Consultant · Builder",
  SITE_BIO:
    "I build tools that make work easier. NetSuite consultant by day, tinkerer by night. Based in Malaysia.",
  SITE_BIO_LONG:
    "I specialise in NetSuite implementations, and building web tools that close the gap between what ERP systems offer and what teams actually need. When I'm not consulting, I'm building Chrome extensions, Cloudflare Workers, and side projects to automate mundane tasks.",
  YEARS_EXP: "2",
  GITHUB_USER: "ArnaldoKJQ",
  PORTFOLIO_TOPIC: "portfolio",
  LINKEDIN_USER: "arnaldokjq",
  CONTACT_EMAIL: "arnaldokoo@gmail.com",
  CONTACT_MSG:
    "Whether it's a NetSuite, a side project, or just a chat — feel free to reach out.",
  WORKER_URL: "http://localhost:8787",

  // Skills section
  SKILLS: [
    {
      cat: "ERP & Consulting",
      name: "NetSuite",
      tags: [
        "SuiteScript 2.x",
        "SuiteAnalytics",
        "SuiteFlow",
        "REST API",
      ],
    },
    {
      cat: "Frontend",
      name: "Web Development",
      tags: [
        "HTML/CSS",
        "JavaScript",
        "Chrome Extensions",
        "GitHub Pages",
      ],
    },
    {
      cat: "Backend & Infra",
      name: "Server & Cloud",
      tags: ["Node.js", "Cloudflare Workers", "GitHub Actions", "REST APIs"],
    },
    {
      cat: "Tooling",
      name: "Productivity Stack",
      tags: ["Jira", "SharePoint", "Microsoft 365", "Groq / Llama", "ChatGPT"],
    },
  ],

  // Experience section
  EXPERIENCE: [
    {
      period: "June 2024 — Now",
      role: "NetSuite Consultant",
      company: "BlackOak Consulting",
      desc: "Functional consultant advising multiple clients on NetSuite implementations, integrations, and process automation. Built internal tooling and Chrome extensions to improve team productivity.",
    },
  ],
};
// ─────────────────────────────────────────────

async function build() {
  console.log("🏗  Building site...");

  // Clean & prep dist
  await fse.emptyDir(DIST);
  await fse.ensureDir(path.join(DIST, "posts"));

  // Copy static assets (css, js, images etc.)
  await fse.copy(path.join(SRC, "public"), DIST);

  // ── 1. Read all posts ──
  const postsDir = path.join(SRC, "posts");
  await fse.ensureDir(postsDir);
  const mdFiles = fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  const posts = mdFiles.map((file) => {
    const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
    const {data, content} = matter(raw);
    const slug = file.replace(/\.md$/, "");
    return {
      slug,
      title: data.title || slug,
      date: data.date || "",
      excerpt: data.excerpt || "",
      tags: data.tags || "",
      content,
    };
  });

  // ── 2. Build individual post pages ──
  const postTemplate = fs.readFileSync(
    path.join(SRC, "templates", "post.html"),
    "utf8",
  );

  for (const post of posts) {
    const tagsArr = post.tags
      ? post.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const tagsHtml = tagsArr
      .map((t) => `<span class="blog-tag">${t}</span>`)
      .join("");
    const liBtn = `<button class="post-linkedin-btn" id="li-post-btn">Share on LinkedIn</button>`;

    const html = postTemplate
      .replaceAll("{{SITE_NAME}}", CONFIG.SITE_NAME)
      .replaceAll("{{POST_TITLE}}", post.title)
      .replaceAll("{{POST_TITLE_JSON}}", JSON.stringify(post.title))
      .replaceAll("{{POST_EXCERPT}}", post.excerpt)
      .replaceAll("{{POST_EXCERPT_JSON}}", JSON.stringify(post.excerpt))
      .replaceAll("{{POST_DATE}}", post.date)
      .replaceAll("{{POST_TAGS_HTML}}", tagsHtml)
      .replaceAll("{{POST_CONTENT}}", marked.parse(post.content))
      .replaceAll("{{LINKEDIN_BTN}}", liBtn)
      .replaceAll("{{WORKER_URL}}", CONFIG.WORKER_URL);

    fs.writeFileSync(path.join(DIST, "posts", `${post.slug}.html`), html);
  }
  console.log(`  ✓ Built ${posts.length} posts`);

  // ── 3. Build blog listing page ──
  const blogTpl = fs.readFileSync(path.join(SRC, "pages", "blog.html"), "utf8");
  const blogPostsHtml = posts.length
    ? posts
        .map((p) => {
          const d = p.date ? new Date(p.date) : null;
          const day = d ? d.getDate() : "—";
          const month = d ? d.toLocaleString("en", {month: "short"}) : "";
          const tagsArr = p.tags
            ? p.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
          const firstTag = tagsArr[0]
            ? `<span class="blog-tag">${tagsArr[0]}</span>`
            : "";
          return `
          <a class="blog-card" href="posts/${p.slug}.html">
            <div class="blog-card-date">
              <div style="font-size:1.4rem;font-weight:400;line-height:1">${day}</div>
              <div>${month}</div>
            </div>
            <div>
              <div class="blog-card-title">${p.title}</div>
              <div class="blog-card-excerpt">${p.excerpt}</div>
              ${firstTag}
            </div>
            <div class="blog-card-arrow">↗</div>
          </a>`;
        })
        .join("")
    : '<p class="blog-empty">No posts yet. <a href="admin.html" style="color:var(--accent)">Write your first post →</a></p>';

  const blogHtml = blogTpl
    .replaceAll("{{SITE_NAME}}", CONFIG.SITE_NAME)
    .replaceAll("{{BLOG_POSTS_HTML}}", blogPostsHtml);

  fs.writeFileSync(path.join(DIST, "blog.html"), blogHtml);
  console.log("  ✓ Built blog.html");

  // ── 4. Build homepage ──
  const indexTpl = fs.readFileSync(
    path.join(SRC, "pages", "index.html"),
    "utf8",
  );

  const skillsHtml = CONFIG.SKILLS.map(
    (s) => `
    <div class="skill-card">
      <div class="skill-cat">${s.cat}</div>
      <div class="skill-name">${s.name}</div>
      <div class="skill-tags">${s.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    </div>`,
  ).join("");

  const expHtml = CONFIG.EXPERIENCE.map(
    (e) => `
    <div class="exp-item">
      <div class="exp-period">${e.period}</div>
      <div>
        <div class="exp-role">${e.role}</div>
        <div class="exp-company">${e.company}</div>
        <div class="exp-desc">${e.desc}</div>
      </div>
    </div>`,
  ).join("");

  const indexHtml = indexTpl
    .replaceAll("{{SITE_NAME}}", CONFIG.SITE_NAME)
    .replaceAll("{{FIRST_NAME}}", CONFIG.FIRST_NAME)
    .replaceAll("{{LAST_NAME}}", CONFIG.LAST_NAME)
    .replaceAll("{{SITE_TITLE}}", CONFIG.SITE_TITLE)
    .replaceAll("{{SITE_ROLE}}", CONFIG.SITE_ROLE)
    .replaceAll("{{SITE_BIO}}", CONFIG.SITE_BIO)
    .replaceAll("{{SITE_BIO_LONG}}", CONFIG.SITE_BIO_LONG)
    .replaceAll("{{YEARS_EXP}}", CONFIG.YEARS_EXP)
    .replaceAll("{{GITHUB_USER}}", CONFIG.GITHUB_USER)
    .replaceAll("{{PORTFOLIO_TOPIC}}", CONFIG.PORTFOLIO_TOPIC)
    .replaceAll("{{LINKEDIN_USER}}", CONFIG.LINKEDIN_USER)
    .replaceAll("{{CONTACT_EMAIL}}", CONFIG.CONTACT_EMAIL)
    .replaceAll("{{CONTACT_MSG}}", CONFIG.CONTACT_MSG)
    .replaceAll("{{SKILLS_HTML}}", skillsHtml)
    .replaceAll("{{EXPERIENCE_HTML}}", expHtml);

  fs.writeFileSync(path.join(DIST, "index.html"), indexHtml);
  console.log("  ✓ Built index.html");

  // ── 5. Copy admin page ──
  const adminTpl = fs.readFileSync(
    path.join(SRC, "pages", "admin.html"),
    "utf8",
  );
  const adminHtml = adminTpl
    .replaceAll("{{SITE_NAME}}", CONFIG.SITE_NAME)
    .replaceAll("{{WORKER_URL}}", CONFIG.WORKER_URL);
  fs.writeFileSync(path.join(DIST, "admin.html"), adminHtml);
  console.log("  ✓ Built admin.html");

  // ── 6. Inject vars into JS files ──
  const mainJsSrc = fs.readFileSync(path.join(DIST, "js", "main.js"), "utf8");
  const mainJsOut = mainJsSrc
    .replaceAll("{{GITHUB_USER}}", CONFIG.GITHUB_USER)
    .replaceAll("{{PORTFOLIO_TOPIC}}", CONFIG.PORTFOLIO_TOPIC);
  fs.writeFileSync(path.join(DIST, "js", "main.js"), mainJsOut);

  const homeJsSrc = fs.readFileSync(path.join(DIST, "js", "home.js"), "utf8");
  const homeJsOut = homeJsSrc.replaceAll("{{WORKER_URL}}", CONFIG.WORKER_URL);
  fs.writeFileSync(path.join(DIST, "js", "home.js"), homeJsOut);

  console.log("\n✅ Build complete → dist/");
  console.log(`   ${posts.length} posts · index · blog · admin`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
