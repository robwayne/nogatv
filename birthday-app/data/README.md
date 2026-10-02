# data

`content.ts` is everything written by hand: the shows, the recommendations,
the books, the letter, the lock.

`episodes.generated.json` is fetched at build time by
`scripts/fetch-episodes.mjs` from TVmaze, which is free, needs no API key, and
carries each show's IMDb id. It holds real episode titles, air dates, season
counts and multi part groupings, and it overrides the approximate season counts
in `content.ts` wherever it has them.

It is committed empty on purpose. The GitHub Actions build fetches it fresh
each time; if that fetch fails the build carries on with whatever is here, and
the site falls back to the hand written counts. To fill it locally:

    node scripts/fetch-episodes.mjs
