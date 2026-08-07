# Career Orbit

Career Orbit is a local-first, explainable job-search agent. It parses a PDF, DOCX, or text resume, creates a candidate profile, queries compliant public job APIs, removes duplicates, ranks listings against the profile, remembers results, and generates an application kit.

It intentionally does **not** automate applications or scrape job boards that restrict it. The dashboard provides pre-filled direct search links for those boards, leaving account-specific browsing and final submission under the candidate's control.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API starts on `http://localhost:8787`.

For a production-style single service:

```bash
npm run build
npm start
```

Open `http://localhost:8787`.

## What works without a paid key

- Resume parsing: PDF with selectable text, DOCX, TXT, MD, RTF
- Candidate memory and job-result persistence in `data/state.json`
- Search planning from skills, target roles, location, and remote preference
- Live queries to Remotive and Arbeitnow public APIs
- Jobicy public API plus direct Greenhouse, Lever, and Ashby feeds that you configure by company board ID
- Duplicate removal, evidence-based score, matched/missing skills, and direct original listing links
- Tailored template cover letter and resume-focus checklist

Scanned PDFs and legacy `.doc` files need OCR/conversion before upload. This keeps parsing reliable without sending resumes to a third party.

## Architecture

`React UI → Express API → planner → source tools → verifier/deduper → scorer → persisted memory`

Each run returns a compact execution trace showing planning, tools used, retry events, verification, and reflection. The server only claims a listing is “indexed by source API”; candidates should always open and review the original listing before applying.

### Expanding real-job coverage

The **Official ATS boards** field accepts company board IDs, for example `ashby:notion`, `greenhouse:company`, or `lever:company`. These use documented public job feeds and return the employer's direct apply URL. The app also supports Google Custom Search and Bing Web Search when their keys are placed in `.env`; it queries official ATS domains and includes the direct result URLs. No search-engine credentials are needed for the built-in public sources.

## Optional AI provider

The current application-kit generator is deterministic and works offline. `.env.example` reserves OpenAI-compatible configuration for a future provider-enhanced writing tool; no API key is required to run the app.
