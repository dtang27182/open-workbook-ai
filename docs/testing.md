# Testing

## Approach

- Unit tests in `tests/unit.test.ts` cover implementation behavior with mocked OpenRouter responses and the Excel test double where needed.
- Component tests exercise the real `ChatWindow` with jsdom. `tests/chat-window-test-helpers.ts` drives component events and exposes results for assertions.
- Live integration tests in `tests/integration.test.ts` exercise the same component with real OpenRouter calls and the Excel test double. They verify user-visible behavior, not a live Excel installation.
- `tests/excel-test-double.ts` simulates the worksheet operations used by the add-in. It does not replace verification of Office integration in Excel.
- `tests/run-tests.mjs` uses Vite to load TypeScript and raw HTML templates without starting a listening server.

## Running Checks

```bash
npm run test:unit
npm run lint
npm run build
npm run validate
```

For live integration tests, set `OPEN_ROUTER_TOKEN` in the environment, then run:

```bash
npm run test:live
```

Both test commands type-check their respective test projects before running. Live tests make real model requests and may incur usage charges. `validate` checks the root `manifest.xml`; it does not exercise the add-in in Excel.

## Changing Tests

- Read the [implementation specification](../tests/implementation-spec.md) for unit behavior and the [integration product specification](../tests/integration-product-spec.md) for live behavior. Keep the relevant specification aligned with intentional behavior changes.
- Assert meaningful outcomes such as worksheet contents, review controls, and restored conversation context rather than incidental ID formats or exact model wording.
- Run the live suite when changing integration tests.
- For changes to Office integration or task-pane presentation, also sideload the add-in and verify the affected behavior in Excel using the [local setup instructions](../README.md#run-locally).
