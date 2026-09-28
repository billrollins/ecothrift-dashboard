<!-- Last updated: 2026-09-25 -->
# Discount logic

How every price change at the register works (Thrift+ member rewards, store sales, Google review, manual discounts, BOGO, banking), and the checks that keep any new discount from opening an arbitrage. **Read this before adding or changing any discount.**

Owner (2026-09-25): *"Treat the Price minus Member reward as the true PRICE, and think of it as the tag just says that amount. So BOGO, discounts etc. do not stack, but they do use the member price."*

Code:
- Thrift+ math: `apps/thriftplus/services/trip.py` (the split) and `apps/thriftplus/services/register.py` (per line).
- POS discounts: `apps/pos/services/sale_mode.py` (Labor Day and Summer), `apps/pos/services/discounts.py` (discount lines), and `CartLine.save()`.

---

## Terms

| Term | Meaning |
|---|---|
| **Tag (T)** | The printed price. A guest's price before discounts. |
| **Reward (R)** | A member's reward on the item, from the nightly engine. 0 ≤ R ≤ 90% of T (`thrift_plus_floor_share` 0.10). |
| **True price (P)** | What the item costs. **Members: P = T − R. Guests: P = T.** Every discount starts from here. |
| **Cover** | The first $10 of a member's rewards each calendar month. The member pays that part of the price, and it pays for the membership. |
| **Instant** | The member takes the reward past the cover off today's price. |
| **Bank** | The member pays the tag and banks the reward past the cover, plus a **5% bonus** (`thrift_plus_bank_bonus` 0.05). |
| **Thrift+ money** | Store credit and banked rewards spent at the register. It is a tender (a way to pay), not a discount. |

## The rules

1. **One price per line: the true price.** Every discount works on P. There is never a discount off the tag *and* the reward on top of it.

2. **A percent discount scales the tag and the reward alike.** X% off gives:
   - T′ = (1 − X%) · T and R′ = (1 − X%) · R, so P′ = (1 − X%) · P.
   - R′ is what fills the cover or gets banked.

   This covers Labor Day, Summer, the Google review 5%, and any manual percent. Example: a $10 tag with a $5 reward, bought with the Google review 5%, costs $4.75, and the reward is $4.75.

3. **Discounts don't stack. One per line, the biggest.** A line gets at most one discount (a store sale, a line discount, its share of a cart discount, or BOGO), and the one that takes the most off P wins.
   - **Today the POS does stack:** a cart discount (Google review) comes off after a line sale, for guests too. Changing that is a POS change for everyone, so it **waits for the owner's OK**.
   - Until then, Thrift+ follows rule 2 for any sale percent on the line, and rule 7 caps the result.

4. **A dollar discount comes off P, never below $0.** It does not change R, but rule 7 caps what the line can put in the cover and the bank.

5. **BOGO (not built yet): rank by true price.**
   - The customer pays the higher P; the other item is free.
   - **A free item earns nothing:** nothing toward the cover, nothing banked.
   - If the member banks, the paid item is paid at its tag (after any percent discount) and banks 1.05 × its reward past the cover.
   - The owner's coats example is the next table.

   | | Red coat | Blue coat |
   |---|---|---|
   | Tag, reward | $20, $5 | $100, $95 |
   | True price | $15 | $5 |
   | BOGO | **paid** (higher P) | free |
   | Banking | pays $20, banks 1.05 × $5 = $5.25 | free, earns nothing |
   | Instant | pays $15 | free, earns nothing |

   Confirmed by the owner (2026-09-25): the free item is always the one with the smaller true price, banked or not. Unbanked, the customer pays the paid item's true price. Banked, they pay its tag and bank the reward at 1.05×.

6. **Instant or bank: the whole trip is one or the other.** Banking is the member's choice per trip; the phone asks on the first add, and the register shows the answer.
   - **Instant:** pay P′ plus the part of R′ that filled the cover. Nothing is banked.
   - **Bank:** pay T′. The cover takes its part of R′ first, and 1.05 × the rest is banked.

7. **Never more back than was spent.** On every line, (to the cover) + (banked, bonus included) ≤ what was paid for the line, where "paid" is after every discount and before tax.
   - The engine cap (R ≤ 90% of T) with the 5% bonus keeps this: 0.9 × 1.05 = 0.945.
   - The trip math clips each line anyway, so discounts and edited prices can't break it.

8. **Thrift+ money is a tender.**
   - Paying with store credit or banked rewards does not change P or R.
   - Tax is on the full amount; the CPA question is open.
   - **The bank bonus isn't earned on Thrift+ money.** On a trip paid partly with credit or banked rewards, the 5% bonus shrinks in proportion to the part paid with them. This stops banking, spending the bank and banking again from compounding the bonus.

9. **Returns undo the line exactly.**
   - The refund is store credit for **95% of what was paid for the line, before tax** (the owner, 2026-09-25: the 5% is the cost of not testing in the store; the setting is `thrift_plus_return_credit_share`). So a return can never pay back more than was paid.
   - The line's cover and bank rows are reversed, bonus included.
   - **A BOGO pair:** returning the paid item gives credit on its price minus the true price of the free item if it is kept. The free item alone gives $0.
   - A line that was re-rung reverses its re-ring credit too.

10. **Price edits at the register set a new tag.** The reward is re-clipped to the new tag (R ≤ 90% of T), so an edited price can't raise a reward. Price overrides also need a reason and a manager (open POS item).

11. **Consignment earns no reward.** Store sales and discounts apply as they do today, and the consignor is paid from `sold_for`.

12. **`sold_for` is what the line really took,** after the member rebate and the line's own sale. Thrift+ money is left out, because it is a tender. Buying analytics read `sold_for` as the realized price, so it must stay honest.

13. **The guest line uses the same math.** "You lost $X" or "would have earned $X" uses R′ after percent discounts, and the $10 cover as a new member would have it.

14. **Re-ring uses the same math as a member sale at that moment.** The instant part is paid as store credit.

## Before shipping any new discount: the arbitrage checks

1. Can a member end up with more **banked plus credit** than they paid? (Rules 7 and 8.)
2. Can a **return** pay back more than was paid, or leave a free item for nothing? (Rule 9.)
3. Can two discounts **combine** past the single biggest? (Rule 3.)
4. Can one item earn a reward **twice**, for example through a re-ring plus a sale, or a return and a re-buy? Re-ring refuses a sale that already has a card, and a return reverses the rows.
5. Does **`sold_for`** stay the real realized price? (Rule 12.)
6. Can a **guest** get member pricing, or a member get it without the card on the sale? Member prices need `CartMember`.
7. Can a **price edit** raise a reward? (Rule 10.)

Record the answer for each in the initiative that ships the discount.

## Status (2026-09-25)

| Rule | State |
|---|---|
| 1, 2 (sale percent scales both) | Built in `register.trip_lines` for Labor Day and Summer. Discount lines (Google review, manual): R′ is scaled by a percent line's share; see rule 3. |
| 3 (no stacking) | **Owner decision.** Today the POS stacks a cart discount after a line sale. |
| 5 (BOGO) | Not built. The POS has no BOGO. |
| 6, 7, 8 (bank 1.05×, cap, no bonus on Thrift+ money) | Built in `trip.totals` and `register.after_complete`. |
| 9 (returns) | Built for single lines (`returns.py`). BOGO pairs wait for BOGO. |
| 10 (price edits) | The reward re-clip is built (`trip_lines` clips to the line's tag). A reason and manager for overrides: open. |
| 11–14 | Built. |
