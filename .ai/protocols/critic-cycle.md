<!-- Canonical: {master}/templates/protocols/critic-cycle.md — v1.3 2026-11-05 (the letter ends with the one thing to change first; v1.2 2026-11-05 Bill's "10 + 2": the vision letter after round 10; v1.1 2026-11-05 the A+ picture, from Eco-Thrift, Bill approved; v1.0 2026-11-04 Bill's method, from Eco-Thrift's .ai/extended/critic-fix-cycle.md). Copy unchanged into <project>/.ai/protocols/. Project-only steps go in the marked section at the end. -->
# Protocol: Critic cycle

**IF** this file is `@`-mentioned **OR** the user says critic cycle / critic it / critic-fix / grade it to A+
**THEN** run the loop below on the page or screen named.

Bill's standing method for making a page or screen great (2026-11-04: "I do it a lot"). Use it on any page he will look at.

## The loop

1. **Coder** builds or fixes the page.
2. **Critic** looks at it (screenshots at desktop and phone width, both themes when the page has them) and gives a **letter grade** plus findings.
3. If the grade is below **A+**, the coder fixes and the critic grades again.
4. Stop at **A+**. If round 10 isn't A+, the critic writes the **vision letter** (below) and **two more rounds** follow. Stop at A+ or after round 12.

Critic and coder are separate passes. Use a fresh subagent as the critic each round, given the page and this file but not the coder's reasoning, so it isn't grading its own work. Keep each round's grade and findings in `workspace/critic/<page>/round-NN.md` so the trail shows progress.

## The A+ picture (Bill, 2026-11-05)

So the bar doesn't drift between fresh critics:

1. **First round:** before grading, the critic writes `workspace/critic/<page>/aplus-picture.md`. In 10-15 lines it describes what an A+ of this kind of work looks like: qualities and scale only (how long, how small, how sure, how many questions), never fixes or mechanisms.
2. **Later rounds:** each new critic reads the picture and grades against it. It changes the picture only with a stated reason, written in the picture file. Findings that don't move the work toward the picture are marked minor.
3. **Stall rule:** if the grade is the same two rounds running, the critic ends with one line, "Biggest single gap to A+:", naming what, not how.

The picture helps the critic judge scale. It is the critic's yardstick and stays with the critic.

## The vision letter, after round 10 (Bill, 2026-11-05: "10 + 2")

For ten rounds the coder hears only findings, one at a time. If round 10 isn't A+, the coder also hears the critic's overall taste, once:

1. A fresh critic reads the whole trail (every round and the A+ picture) and writes `workspace/critic/<page>/vision.md` to the coder or designer, in two lists of 3 to 6 items each:
   - **"What I really haven't liked":** x, y, z;
   - **"What I was hoping to see":** a, b, c.
   It talks about the experience (how the page feels, reads and is used), never code or fixes, and ends with one line, **"What I'd change first:"**, naming the single item that matters most.
2. The coder works toward the letter, plus that round's findings.
3. Rounds 11 and 12 are graded against the picture and the letter.

The letter is direction, not a spec: the coder or designer still owns the fix.

## What a critic finding holds

Every finding names three things:

- **What is wrong:** the exact spot ("the Hours card on Profile").
- **Why it is wrong:** what it does to the person using it ("it reads as the most important thing on the page, but it is the least used").
- **Possible actions:** a few directions that *might* help, only to explain the problem better.

The critic does **not** decide the fix. Solving it is the coder's job; the possible actions are context, not orders. Bill's example: "too bright" might come with "switch the palette, or bring up contrast, or change the font colour". That isn't what has to be done; it helps say what "bright" meant.

## Grading

- **A+:** nothing left that Bill would point at. Clean, self-explanatory, no clutter, fits house taste: no layout shift, banners never move the page, real content, short words.
- **A / A-:** small polish left.
- **B and below:** a real problem a user would hit or notice.

The critic grades the page as it is, not the effort. A round that makes it worse says so.

## Report

**STOP.** Report the page, how many rounds ran, whether the vision letter was written, the last grade, what is still open, and where the trail is in `workspace/`.

## Project-only steps

<!-- Add project-specific steps below this line. -->

- **"2+1" (Bill, 2026-11-10).** A short form of the loop for work that should already be close: "Make sure it gets to A+ in 2 rounds or so. It could be a 2+1 where you do 2 rounds. And then the +1 is a fully descriptive what was wrong, what should be better round."
  1. **Round 1 and round 2:** the loop as written (a fresh critic grades against the A+ picture, the coder fixes).
  2. **The +1:** a fresh critic reads the whole trail and writes the letter in the vision letter's shape ("What I really haven't liked", "What I was hoping to see", "What I'd change first"), fully descriptive, to `workspace/critic/<page>/vision.md`. The coder works toward it once, and a last fresh critic gives the final grade in `round-03.md`.
  3. Stop there, whatever the grade, and report it. A page already at A+ after round 1 or 2 skips the rest.
- **Where the trail lives when a sub runs the cycle:** in the **main checkout's** `workspace/critic/<page>/`, not the sub's own worktree, so it outlives the sub.
