# Music

Only **CC0** and **CC-BY** tracks are accepted. Listeners see the title only for CC0, and title plus artist for CC-BY. Source and
license are stored for auditing but not displayed.

## File naming

Metadata is parsed from the file name:

```
Artist__Title__License[__source].ext
e.g. Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3
```

- The separator is **two underscores**, so hyphens, brackets, apostrophes and non-Latin text are fine in titles.
- Licenses: `CC0`, `CC-BY-4.0`, `CC-BY-3.0`, `CC-BY-2.0` (CC-BY requires a version). Source is a domain name and optional.
- File names cannot contain `/ \ : * ? " < > |`; use look-alike characters (`／ ： ？`). In local dev `#` is not allowed either
  (use `＃`). Commas, `&`, `;` and `'` are fine.
- Extensions: `mp3`, `ogg`, `opus`, `m4a`, `webm`, `wav`. Maximum size 30 MB.

## Local files

Put files in `public/audio/` (git-ignored) and run `npm run tracks`. It writes `public/audio/tracks.json` and reports any file name
that does not follow the convention. `npm run dev` then plays them; this is the fallback when no API is available.

## Durations

Each track's duration is measured **at upload** (in the browser for the admin page, with `music-metadata` in the CLI tools) and stored
in `tracks.json`. The playlist can therefore show every duration without extra R2 reads. Values are stored unrounded and truncated to
seconds when displayed, so the playlist and the player always agree. Tracks without a stored duration show none in the playlist.

## Player behaviour

- Plays the queue in order and loops; shuffle keeps the current track; a track that fails to load is skipped.
- `src/audio/player.ts` wraps one `<audio>` element and exposes an immutable snapshot for `useSyncExternalStore`. Playback time is
  read from `player.currentTime` in `requestAnimationFrame` loops (progress bar, time label) and never stored in React state.
- Volume and shuffle persist in `localStorage`. Space toggles playback; Escape or an outside click closes the playlist.
- Title line: `title — artist` on the left, `elapsed / total` on the right (`1:23 / 3:45`, `0:12:34 / 1:02:03` from one hour). When
  space is tight the title is truncated first, the artist keeps up to 45% of the line, and the time is never truncated. Full text is
  in the tooltip.
- UI style: bare icons with a two-layer shadow and a faint bottom scrim (stronger on hover and with the playlist open). Motion is
  limited to `transform`/`opacity` and is disabled under `prefers-reduced-motion`.

See also: [backend-r2.md](backend-r2.md) for where the library is stored, [admin.md](admin.md) for uploading.
