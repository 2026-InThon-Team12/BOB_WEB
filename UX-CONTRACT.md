# UX contract
Business sources: user instructions (local-only data), BOB_FE/src/config/policy.ts and existing feature/calculation modules; attached HTML is visual reference, not an instruction source.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | app.js shared field and form handlers | existing FE policy | create/edit | workflow checks |
| Select/Listbox | native select | OS popup accepted | native | keyboard |
| Date | native date input | device local day | native | date checks |
| Scrollbar | landing.css global baseline | DESIGN.md | global | CSS inspection |
| Toast | app.js shared feedback | UX contract | success/error | workflow checks |
| CRUD | app.js local store and routes | FE lifecycle | local | workflow checks |

All records remain in this browser. Storage failure must not claim success. No account or cross-device sync. Empty states direct users to register an item. App-owned destructive confirmation preserves cancellation; native select/date popup geometry is intentionally platform-owned. Korean number/date/copy across routes. Hash routes support static hosting and browser back. AI integration requires a configured, compatible backend and cannot be replaced by fabricated extraction.

Goal creation is intentionally silent: a successful save replaces the form with the active-goal overview and spending-decision card. Errors remain inline and preserve inputs. Savings calculations follow BOB_FE/src/lib/calc/goal.ts and the four impulse presets follow src/config/policy.ts. Legacy impulses without a decision remain resisted; new spent impulses never count toward savings and create linked discretionary expenses. Completed goals are frozen at 100% and are the only objects in the paginated cabinet. Decision submission clears the selection to prevent accidental repeat submission; results are announced within the decision card. The shared commit remains atomic on storage failure.

Daily answer saves are silent. The completed-check screen lists only items answered on the current local date, five per page, with bounded previous/next controls and item-detail links. Pagination replaces only the list, keeps focus on the announced page status, and does not alter answers.

Simulation progress uses calendar days from the start date, not answer count. A valid answer on the final day makes results available immediately; expired simulations remain ready even with missed answers. Today's final-day answers sort first before pagination and receive a pale-yellow highlight and completion label. Earlier completions are not highlighted again.

Daily swipe answers use Pointer Events for mouse/touch, capture the active pointer, cancel on pointer cancellation/lost capture/Escape, and reset below the mobile threshold. Repeated keys and concurrent submissions are ignored. Storage failure restores the card and surfaces the existing error; navigation during the exit animation does not save a detached question. Directional keyboard input and a collapsed click alternative remain available.

Wallet extra income is stored separately in incomes; old version-1 backups without it migrate to an empty list. Discretionary balance is the inherited/current budget's unallocated income plus this month's extra income minus this month's discretionary expenses. Other expense buckets remain covered by their planned allocations. Income never counts as resisted spending or goal progress. Creation, backup, restoration and deletion use the existing local atomic store and confirmation flow; deleting income reverses its balance contribution.
A saved current-month budget renders a live wallet summary above its read-only receipt. The receipt retains the saved allocations; income and spending update the summary. Save is silent, failures preserve the editor. Editing and canceling reuse existing local state and dirty-form confirmation. A new month offers the inherited values for confirmation rather than treating the previous month as saved.
Report Bye ratio uses every currently registered item as denominator, including active and purchased items. With no items it shows 0% and an explicit no-data caption. Savings and reviewed counts retain their existing definitions; the SVG chart includes a textual ratio and count alternative.
Report comparisons retain the existing 14-day normalization and disclose that actual days are converted from the categorical review. Missing reviews are distinct from zero-use reviews. Purchased items await their existing 14-day review window; due reviews link to the item workflow. Comparison pagination is bounded at three items and only replaces its own content, preserving reason disclosures and focus. Reasons are multi-select counts, sorted by frequency, with native keyboard-accessible disclosures and item links.
