# Dashboard Route Inventory

This inventory records the dashboard destinations and the checks completed during
the command-center upgrade. It is intentionally kept next to the application
code so future route changes can update the contract rather than relying on
memory.

| Route | Purpose | Authentication | Role restriction | Dashboard entry | Status |
| --- | --- | --- | --- | --- | --- |
| `/members` | Member directory | Yes | Authenticated roles | Members metrics, Quick Actions | Registered |
| `/payments?view=unpaid` | Membership collection queue | Yes | Admin/finance for mutations | Membership collection, Quick Actions | Registered |
| `/frf` | FRF claims and current collection | Yes | Authenticated roles; mutations server-gated | FRF metrics, Quick Actions | Registered |
| `/tasks` | Task queue | Yes | Authenticated roles | Follow-through, Quick Actions | Registered |
| `/calendar` | Operational calendar | Yes | Authenticated roles | Upcoming work | Registered; dashboard link corrected from `/events` |
| `/committee` | Current committee | Yes | Authenticated roles | Committee overview | Registered |
| `/meetings` | Committee meetings | Yes | Authenticated roles | Upcoming committee meeting | Registered |
| `/reports` | Report hub | Yes | Authenticated roles | Finance section | Registered |
| `/loans` | Loan portfolio | Yes | Authenticated roles; mutations server-gated | Finance section | Registered |
| `/documents` | Document room | Yes | Authenticated roles; mutations server-gated | Document health | Registered |
| `/audit` | Audit trail | Yes | Admin/finance | Recent activity | Registered |
| `/welfare-programs` | Welfare/community-services hub | Yes | Authenticated roles | Welfare section | Added compatibility route to the existing services hub |
| `/services` | Welfare/community-services hub | Yes | Authenticated roles | Canonical existing destination | Registered |
| `/welfare` | Legacy welfare destination | Yes after redirect | Authenticated roles | Member detail links | Added compatibility redirect to `/services`, preserving query |
| `/events/:id` | Event detail | Yes | Authenticated roles | Upcoming event item | Registered; dashboard links preserve `returnTo` |
| `/tasks/:id` | Task detail | Yes | Authenticated roles | Upcoming task item | Registered; dashboard links preserve `returnTo` |

## Navigation contract

- Dashboard-origin detail and create links use the internal `returnTo` helper.
- Missing alert destinations render as non-clickable rows instead of falling
  back to `/dashboard`.
- Unauthenticated protected deep links carry their validated destination through
  `/login` and return there after successful authentication.
- Explicit application Back buttons continue to use the existing validated
  `returnTo` contract; browser-native Back is not replaced.

## Verification status

- Portal and API typechecks: passed.
- Portal production build: passed.
- API regression suite: passed.
- Static route/link audit: completed for the destinations listed above.
- Playwright runtime navigation tests: not executed because the workspace does
  not currently have the Playwright Chromium executable installed.
- Existing build warnings about sourcemaps and large chunks remain unrelated to
  this route work.