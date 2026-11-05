# Decision analysis tool

A browser-based multi-criteria decision analysis (MCDA) tool: weighted sum,
AHP pairwise comparison with consistency ratio, one-at-a-time weight
sensitivity and Monte Carlo rank analysis. Plain JavaScript, no libraries,
no backend.

- **Live:** https://gazish.github.io/projects/decision-analysis-tool/
- **Data:** the example (five climate adaptation measures scored on five
  criteria) is **illustrative, made-up data** for the demo. It is not real
  municipal data and not taken from my MSc thesis.

## What it does

1. **Options and criteria.** An editable table. Each criterion has a
   direction (higher or lower is better) and an uncertainty rating
   (none, ±5%, ±15% or ±30% of the criterion's range in the table).
2. **Weights.** Direct points, or AHP: pairwise judgements on Saaty's 1 to 9
   scale, weights from the principal eigenvector, consistency ratio
   `CR = CI / RI`, and a pointer to the least consistent judgement with a
   suggested replacement (the geometric mean of the indirect comparisons).
3. **Ranking.** Weighted sum of linear value scores (worst value in the table
   = 0, best = 1), shown as stacked contributions per criterion.
4. **Sensitivity.** For each criterion, the exact weight interval in which the
   top option stays first, with the other weights rescaled in proportion.
   A line chart shows every option's score as one weight goes from 0 to 100%.
5. **Monte Carlo.** 5,000 scenarios with Dirichlet-distributed weights around
   the current weights (or uniform over all weights, as in SMAA-2) and,
   optionally, uniform perturbations of the table values. Reports rank
   acceptability and rank intervals. Fixed seed, so results are reproducible.

You can download the results as CSV, or copy a link that stores the whole
analysis in the URL.

## Files

| File | Contents |
|---|---|
| `mcda.js` | The maths: value functions, weighted sum, AHP, consistency, stability intervals, Dirichlet sampling, simulation. No browser code |
| `mcda.test.mjs` | 11 unit tests, including the standard 3 x 3 AHP textbook example and a brute-force check of the stability intervals |
| `app.js` | The interface |
| `index.html`, `tool.css` | Page and styles. Shared chart helpers are in `/assets/js/charts.js` |

## Run the tests

```bash
node --test projects/decision-analysis-tool/mcda.test.mjs
```

Node 20 or later. No packages to install.

## Assumptions and limitations

- Additive model: assumes preferential independence between criteria, and
  lets a strong score on one criterion compensate for a weak one.
- Local linear scales: weights are trade-offs over the ranges in the table,
  so adding an option that widens a range should prompt a review of weights.
- AHP is used only to elicit criterion weights, not to compare options.
- Uncertainties are independent and uniform; real ones are often correlated.

## References

- Saaty, T. L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill.
- Belton, V., and Stewart, T. J. (2002). *Multiple Criteria Decision Analysis: An Integrated Approach*. Kluwer.
- Lahdelma, R., and Salminen, P. (2001). SMAA-2: Stochastic multicriteria acceptability analysis for group decision making. *Operations Research*, 49(3), 444 to 454.
