# R-070 · Chore: run the seller-factor fit on dev (report only) and check it against R-062
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 18:33 · **Finished:** 2026-09-24 18:34 · **Status:** done

`--save` was not passed. Exit 0. About 2 seconds (18:33:54 to 18:33:56).

## Output

```
Finished trucks: 201; actual / predicted (after shrink 0.9 kept): median 0.775 (p25 0.632, p75 0.945).
seller              n    p25  median    p75  factor
target             71  0.713   0.791  0.986  0.791
amazon             41  0.529   0.670  0.785  0.670
walmart            37  0.730   0.856  0.994  0.856
costco             37  0.686   0.862  0.974  0.862
wayfair             9  0.251   0.303  0.417  0.303
home depot          6  0.597   0.744  0.862  0.744
Report only. Run again with --save to use it, then recompute_buying_valuations.
```

## Compared with R-062

R-062 divided by the prediction before shrink. This command keeps 0.9 of that prediction, so its median should be R-062's ÷ 0.9. Every seller agrees within 0.03. The n's match. No seller's count differs.

| Seller | R-062 n | R-062 median | ÷ 0.9 | This fit | Gap |
|---|---:|---:|---:|---:|---:|
| overall | 201 | 0.698 | 0.776 | 0.775 | 0.001 |
| target | 71 | 0.712 | 0.791 | 0.791 | 0.000 |
| amazon | 41 | 0.603 | 0.670 | 0.670 | 0.000 |
| walmart | 37 | 0.771 | 0.857 | 0.856 | 0.001 |
| costco | 37 | 0.776 | 0.862 | 0.862 | 0.000 |
| wayfair | 9 | 0.272 | 0.302 | 0.303 | 0.001 |
| home depot | 6 | 0.670 | 0.744 | 0.744 | 0.000 |

## Observations

- Yes, `--save` these factors. They are the R-062 backtest, after the 0.9 shrink the valuation already applies, and every seller's truck count matches.
- Wayfair at 0.30 is a large cut, on 9 trucks. The five lowest R-062 ratios were all Wayfair, so the factor is not one odd truck.
- Home Depot is only 6 trucks. It still lands on the same median as the backtest, so leaving it out would be the thinner choice.
