---
title: "Is this finally going to post to LinkedIn"
date: "2026-04-13"
excerpt: "Creating a blog using LinkedIn API"
tags: "nodejs, linkedin"
---

I’ve been working on building a blog platform directly into my website. I wanted more than just publishing posts locally, so I added a way to automatically share them on LinkedIn as well.

### Idea

The workflow is simple:

1. Write a blog post on my website
2. Publish it
3. Automatically send it to LinkedIn

This removes the need to manually copy and paste content. (and cause why not)

### How It Works

- Content written in .md
- Node.js processes the post
- After publishing, it sends a request to the LinkedIn API
- Post is created on LinkedIn

### Challenges

- Figuring out how to integrate with LinkedIn (thanks to [Marcus Noble](https://marcusnoble.co.uk/2025-02-02-posting-to-linkedin-via-the-api/) for this)
- Handling the authentication flow (for obvious reason, we don't want anyone to be able to post using my local)
- Formatting content to fit LinkedIn posts

### Final thoughts

Allows me to manage my content in one place. It also makes it easier to review what I’ve done over a month or year without going through each post in LinkedIn.