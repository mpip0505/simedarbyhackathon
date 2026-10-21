# Method agreement: our ranking against simplified published approaches
Generated on data_version `f12bc98c3fbd`, 564 sites. Regenerate with `python -m ml.method_agreement`.

> These are **simplified stand-ins** built from the fields we already have. They are not the real Tree Equity Score, i-Tree Landscape or Boston tool,
> which use US census and land-cover data. **Agreement is not accuracy**: there are no ground-truth labels, so nothing here shows any ranking is right.

## The methods
- **Heat only**: Heat only: hottest 250 m surroundings first (the idea behind a land-surface-temperature ranking such as Boston's)
- **Canopy gap only**: Canopy gap only: least green 250 m surroundings first (the canopy-gap half of Tree Equity Score)
- **Heat + gap**: Heat and canopy gap, equal weight (a Tree Equity Score or Boston style blend, without the social layer we do not have)
- **Equal three**: Our three scores with equal weights (a user who leaves every slider at the same value)
- **Ours**: Ours: heat 45%, connectivity 30%, shade 25% (the default weights)

## How many of the top 20 sites two methods share

| | Heat only | Canopy gap only | Heat + gap | Equal three | Ours |
|---|---|---|---|---|---|
| **Heat only** | 20 | 1 | 10 | 0 | 0 |
| **Canopy gap only** | 1 | 20 | 4 | 3 | 3 |
| **Heat + gap** | 10 | 4 | 20 | 0 | 0 |
| **Equal three** | 0 | 3 | 0 | 20 | 18 |
| **Ours** | 0 | 3 | 0 | 18 | 20 |

## Rank correlation across all 564 sites (Spearman, 1 = identical order)

| | Heat only | Canopy gap only | Heat + gap | Equal three | Ours |
|---|---|---|---|---|---|
| **Heat only** | 1.00 | 0.31 | 0.79 | 0.72 | 0.78 |
| **Canopy gap only** | 0.31 | 1.00 | 0.79 | 0.21 | 0.33 |
| **Heat + gap** | 0.79 | 0.79 | 1.00 | 0.60 | 0.69 |
| **Equal three** | 0.72 | 0.21 | 0.60 | 1.00 | 0.97 |
| **Ours** | 0.78 | 0.33 | 0.69 | 0.97 | 1.00 |

## How spread out the top 20 are

| method | distinct 250 m areas among its top sites |
|---|---|
| Heat only | 9 |
| Canopy gap only | 6 |
| Heat + gap | 7 |
| Equal three | 6 |
| Ours | 6 |

## Do the others find our 14 steady picks?

Of the sites our ML uncertainty run calls steady (in the top 20 in at least 80% of plausible settings), how many each method also puts in its own top 20:

| method | steady picks it also finds |
|---|---|
| Heat only | 0 of 14 |
| Canopy gap only | 2 of 14 |
| Heat + gap | 0 of 14 |
| Equal three | 14 of 14 |
| Ours | 14 of 14 |

## How to read this
- Low overlap between *heat only* and *ours* means the connectivity and shade scores change which sites come first. That is by design, but it is a choice the planning team should make knowingly, which is why the weights are sliders.
- High overlap between two methods does not make either right; low overlap does not make either wrong.
- The literature finding it echoes: tools agree on broad areas and differ on the specific top sites (Austin, 2025). See docs/prior-art.md.
