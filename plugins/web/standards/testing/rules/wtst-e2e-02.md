# WTST-E2E-02: Journey Tests Drive the Real Rendered Site

## Intent

A journey test is the page's only test, so it must exercise what a user receives: the site built and served by its own server, entered by URL, and moved through by visible controls. Mocked pages, mounted components, or stubbed site modules turn it back into a unit test of something else and leave the real composition unproven. Mocking follows `TST-STRU-01`, which allows none in e2e.

## Fix

- Start the site through the e2e runner's web-server configuration, such as Playwright `webServer`, against a dev or production build.
- Enter with `page.goto` and move with role, label, or text locators; assert what the user sees.
- Remove request fulfilment of the site's own pages or modules, component-mount fixtures, and module mocks.

## Code Superpowers

- In `*.spec.e2e.ts`, flag `mount(`, `vi.mock(`, `page.route(` or `context.route(` handlers that fulfil site URLs, and imports of site source modules.
- Flag e2e configs without a web-server or base-URL target.

## Common Mistakes

1. Using Playwright component testing for a journey.
2. Fulfilling the site's own API routes to make a journey deterministic instead of seeding real data.

## Related

`WTST-E2E-01`, `TST-STRU-01`, `TST-STRU-05`.
