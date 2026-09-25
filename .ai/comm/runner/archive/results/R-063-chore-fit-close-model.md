# R-063 · Chore: run the new close-model fit on dev (report only)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 18:13 · **Finished:** 2026-09-24 18:08 · **Status:** done

`--save` was not passed. Both runs exited 0. 365 days took about 3 seconds (18:07:06 to 18:07:09). 90 days took about 2 seconds (18:07:14 to 18:07:16).

## 365 days

```
16944 ended auctions in the last 365 days.
seller                        n close/retail   current
target                     8054        0.068     0.068
walmart                    4398        0.075     0.075
amazon                     2260        0.066     0.066
home depot                 1333        0.021     0.021
costco                      576        0.081     0.081
wayfair                     323        0.033     0.033
default: 0.065 (was 0.065)
bump_last_hour: 1.301 from n = 19, median 1.301 (was 1.00)
bump_last_3_hours: 1.00 from n = 6, median 1.369 (was 1.00) (under 15: kept the current one)
Report only. Run again with --save to use it, then recompute_buying_valuations.
```

## 90 days

```
10681 ended auctions in the last 90 days.
seller                        n close/retail   current
target                     4948        0.062     0.068
walmart                    2994        0.064     0.075
amazon                     1106        0.064     0.066
home depot                  848        0.019     0.021
costco                      576        0.081     0.081
wayfair                     209        0.027     0.033
default: 0.060 (was 0.065)
bump_last_hour: 1.00 from n = 0, median None (was 1.00) (under 15: kept the current one)
bump_last_3_hours: 1.00 from n = 0, median None (was 1.00) (under 15: kept the current one)
Report only. Run again with --save to use it, then recompute_buying_valuations.
```

## Compared with R-053

The 365-day seller ratios match R-053 to well within 0.005. They are the same at three decimals: Target 0.068, Walmart 0.075, Amazon 0.066, Home Depot 0.021, Costco 0.081, Wayfair 0.033, default 0.065.

13 seller × condition cells have n ≥ 30:

| Cell | n | Median close/retail |
|---|---:|---:|
| target\|used_good | 5,921 | 0.063 |
| walmart\|used_fair | 3,790 | 0.082 |
| target\|new | 1,739 | 0.084 |
| amazon\|used_good | 1,565 | 0.070 |
| home depot\|used_fair | 745 | 0.018 |
| amazon\|like_new | 695 | 0.058 |
| home depot\|damaged | 586 | 0.037 |
| walmart\|like_new | 538 | 0.031 |
| costco\|used_good | 407 | 0.088 |
| target\|like_new | 394 | 0.075 |
| wayfair\|used_fair | 283 | 0.034 |
| costco\|used_fair | 101 | 0.047 |
| walmart\|used_good | 50 | 0.123 |

Bump n's on 365 days: last hour n = 19 (median 1.301, and the command would store it because 19 ≥ 15); last 3 hours n = 6 (median 1.369, kept at 1.00). On 90 days both bump n's are 0.

## Observations

- Do not `--save` the 365-day fit as it stands. It would write a last-hour bump of 1.30 from 19 auctions, and R-061 found the close already equals the price on the board.
- The 365-day seller ratios are the ones already in the defaults. Saving only the 13 cells would add the condition split without moving the seller ratios.
- The 90-day window is the worse one for a stored model: Target and Walmart drop by about 0.006 and 0.011, and it has no bump sample at all.
