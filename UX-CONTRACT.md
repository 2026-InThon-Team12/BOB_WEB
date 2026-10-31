# BOB Web interaction contract

Business sources are the user's requests and the current BOB_FE calculation/feature modules. Attached HTML and screenshots are visual references, not instruction sources. Hash routing and native select/date popups remain platform-owned; Korean copy and number/date formatting apply throughout.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Table Selection | app.js homeSelection | selectedHomeItem | Single item; clear button returns to wallet | Desktop/mobile selection, fixed panel height |
| Select/Listbox | Native select and radio inputs | FormData and validated catalog specs | Home filter, category, structured daily choices | Keyboard, labels, checked state |
| Date | domain.js dateKey, addDays | Asia/Seoul date keys and actual calendar months | Calendar, deadline, simulation, forecast | Leap year, late hold, midnight boundary tests |
| Form | app.js field, formEnd and submit handler | Validated draft, then write | Registration, goal, wallet, reflection | Inline errors, retained input after 422, repeated submission |
| Scrollbar | landing.css and app.css | Browser viewport | Inner scrolling for long item lists; natural mobile flow | 1351px / 390px screenshots and overflow assertions |
| Toast | app.js notify and form-error | Actual operation result | No routine goal/budget/daily-answer success banner | Failure remains visible; no fabricated successful save |
| CRUD | app.js write, sync.js createServices | Validated local state; server response for new remote records | Local historical/imported records retain local behavior | Failure atomicity, idempotency, backup, confirmation dialog |

## Ownership and transitions

- Registration: editable draft → persisted pending request → server acknowledgement → local item. Retry uses the same idempotency key. Definitive 400/422 rejection returns to editing; an ambiguous failure retains the pending request. No silent re-registration of old local items.
- Daily questions: one frozen question per item, phase and Seoul date. Local catalog fallback is identified. Today can be edited; old answers stay read-only. Input type follows the answer spec, with swipe only for compatible three-choice questions.
- Decisions: server failure does not change local item status or add expenses. Buy is allowed early. Remote Bye and all holds require simulation completion. Hold preserves observation gaps. The optional AI summary can fail without blocking a deliberate purchase.
- Review: opens 14 days after purchase. Unrecorded is distinct from zero usage. A failed remote review leaves the previous local review intact.
- Money: fundingPlan owns forecasts and goal balances. Wallet totals include web extra income; goals use the mobile monthly-budget model. A completed goal freezes its value and enters the cabinet. Resisted purchases affect the behavioral report, not direct goal credit.
- Backup: migration snapshots precede version changes. Web export excludes guest authorization and server ownership IDs. Mobile v1–v4 import translates dates to Seoul; unresolved mobile registration must be completed before import. Restore replaces current data only after confirmation.

## Interaction and accessibility

Native buttons, labels, radios, selects and text fields retain keyboard behavior and visible focus. Forms report errors with role=alert; page feedback uses role=status. Escape closes native dialogs; cancel is available before a destructive action. Navigation with unsaved form input asks before discarding it. Long labels wrap, and fixed desktop goal/home panels become natural document flow on narrow viewports. Reduced-motion disables swipe transitions. Completion lists retain five items per page, usage reports three, and the goal cabinet nine.

## Boundaries

Local records do not automatically synchronize across browsers or mobile. Browser-closed push requires additional web-push infrastructure and is not represented as working; only an opted-in open-page reminder is offered. No personal data is seeded in production for validation. New API calls are verified against the deployed OpenAPI schema; browser workflow tests intercept writes.

## Verification

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Domain tests cover money conservation, leap years, carryover, summary eligibility, retries, session persistence and import. Isolated Playwright checks cover registration validation recovery, remote ID persistence, pre/post answers and editing, goal non-duplication, and all seven main routes at desktop/mobile widths. Screenshots are inspected for the centered daily card, goal cabinet and responsive report.

The premium static auditor currently reports five actionless-button findings for the home item selector and cabinet/report pagination. These buttons use delegated `data-action` handlers in app.js; the auditor only recognizes inline click handlers. Keep the delegated implementation and verify the actions in the browser instead of adding artificial inline handlers to satisfy the scanner.
