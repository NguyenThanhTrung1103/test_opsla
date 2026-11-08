# Decisions up front (stage 5)

Every item left open before an unattended AI build becomes a guess or a stall. Ask only the open items for the chosen depth, each with a recommended default.

| # | Decision | Depth |
|---|---|---|
| B1 | Owner-only paths: which behaviours only the owner may change (payments, refunds, payouts, tax, personal data, tracking)? | D0+ |
| B2 | Channel and legal rules for this kind of product: consent / opt-in, unsubscribe, legal footer or notices, suppression lists, data retention, age or region limits. | D0+ |
| B3 | Business values: prices, rates, thresholds, legal text. Each one is either decided (ask for the value) or an owner key with no default. | D1+ |
| B4 | Failure the user sees: when a vendor, network or payment fails, what the user is told and how they recover. | D1+ |
| B5 | Copy claims: every promise planned for marketing copy must be true in the product. List them. | D1+ |
| B6 | Business limits: launch date, spend cap, a budget the product must fit. What happens when one is hit (trim, stop and report, or raise; who may raise)? | D1+ |
| B7 | Positioning and words: words never to use, tone, UI language. | D2 |
| B8 | Pricing shape: list price, cheaper reduced-scope options, upgrade credit, refunds/transfers. | D2 |
| B9 | Activation and kill: the first-value metric, and the number that kills or pivots the product. | D2 |

Standing policy (stop line, vendor sandbox, cost tier, off-limits systems) lives in PROFILE. If PROFILE has none, ask once at D1+: "Where must the build stop (for example, ready to publish), and what must it never touch?"
