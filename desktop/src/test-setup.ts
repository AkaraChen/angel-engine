import { configure } from "@testing-library/dom";

// Testing Library's 1s default for `findBy*`/`waitFor` is a scheduling budget,
// not a correctness signal. `bun run test` fans every workspace suite out
// through turbo at once, so a shared CI runner can take longer than a second to
// settle the first render of a file — which surfaced as `fleet.loading` still
// on screen when the query had simply not been given a slice of the CPU yet.
// Give the async utilities headroom so slow scheduling reads as slow, not
// broken; a genuinely stuck query still fails on the vitest test timeout.
configure({ asyncUtilTimeout: 10_000 });

export {};
