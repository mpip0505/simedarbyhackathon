# Geist and Geist Mono (bundled so the demo works offline)

Latin subset, variable weight (100 to 900), woff2. Used by `css/app.css` as `--font-sans` and `--font-mono`.
Licence: SIL Open Font License 1.1 (see `LICENSE`, copied from the same npm package).

| File | Bytes | SHA-256 |
|---|---|---|
| `geist-latin-wght-normal.woff2` | 29400 | `19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1` |
| `geist-mono-latin-wght-normal.woff2` | 23128 | `684ad5b531f81d43c1e8c7038262d5db7cdc1f68006e04d6c7769efa8d33c8cc` |

Source: the Fontsource packages `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, version 5.3.0
(<https://github.com/fontsource/font-files>), fetched from jsDelivr:

```
https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.3.0/files/geist-latin-wght-normal.woff2
https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.3.0/files/geist-mono-latin-wght-normal.woff2
```

The Latin subset does not include a few symbols (for example `≥`); the browser draws those from the fallback font.
Atkinson Hyperlegible (`../atkinson-hyperlegible/`) stays bundled as the fallback face in the font stack.
