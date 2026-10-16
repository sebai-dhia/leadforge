# leadforge

Helps freelancers find local businesses that could need custom software, scores them, and drafts a personalized cold email for each. Search runs in n8n (Google Places + Claude); you review every draft before sending.

| Folder | What it is |
|---|---|
| [`mvp/`](mvp/README.md) | First version: one static page calling an n8n webhook. No accounts, no database. |
| [`app/`](app/README.md) | Product version: Angular 22 + Spring Boot 4.1 + PostgreSQL, with n8n behind the backend. |

Start with `app/README.md` to run the full stack.
