# Professional Legal & Tax Assistant — Static Demo

A deterministic, zero-backend product demonstration built from fictional data.
It makes no LLM calls, uploads no files, and requires no paid runtime service.

The page automatically scrolls into a guided four-workflow tour. Visitors can
pause, replay, choose a workflow, or use the prominent **NEXT** control. The tour
finishes at the contact and deployment options.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/`.

## Scenarios

- Grounded legal research with citations
- Document intake, OCR confidence, and vector indexing
- Docket snapshot comparison and timeline review
- Tax notice triage with specialist routing

Scenario content lives in `scenarios/`. The renderer supports:

```text
user_message, agent_message, status, agent_route, tool_start, tool_complete,
document_upload, document_parsed, citation, generated_file, metric, warning,
call_to_action
```

Run the dependency-free validation:

```bash
node tests/validate-demo.mjs
```

## Contact configuration

`config.json` is public and must never contain secrets.

- Set `contactEmail` to a public business address for the mailto fallback.
- Optionally set `formEndpoint` to an HTTPS static-form endpoint.
- Leave both unconfigured to keep lead submission disabled.

The form intentionally does not collect confidential legal or tax facts.

## GitHub Pages

The included workflow deploys this repository as a static Pages site. It uses only
official GitHub actions and uploads the static repository contents.

## Disclaimer

All names, matters, documents, citations, scores, and timelines are fictional.
The product assists professionals and does not replace legal, tax, or other
professional judgment.
