# Robustness test: blurry, shaken, small, dark and tilted photos

`degrade.py` makes 16 damaged copies (blur, motion blur, low resolution, heavy JPEG, dark, tilt, perspective, shadow, noise and a
realistic "phone photo" mix) of three sample reports in `samples/monthly/`. `bench.py <name>` reads them all and reports, per kind
of damage, the share of the 25 values read exactly right, how many were read wrong, and the seconds per photo.

    python dataset/robustness/degrade.py
    python dataset/robustness/bench.py after

## Results (75 values per row; "wrong" = a value read but incorrect; every wrong value is marked "please check")

| Damage | Before | After | Wrong (before → after) |
| --- | --- | --- | --- |
| Clean | 100% | 100% | 0 → 0 |
| Light blur (σ 1.5) | 96.0% | 97.3% | 1 → 1 |
| Medium blur (σ 2.5) | 64.0% | 81.3% | 3 → 9 |
| Heavy blur (σ 3.5) | 4.0% | 10.7% | 7 → 12 |
| Shake, 9 px | 1.3% | 10.7% | 1 → 9 |
| Very small photo (35%) | 76.0% | 93.3% | 11 → 4 |
| Phone mix (tilt, soft focus, shadow, noise, JPEG) | 97.3% | 98.7% | 1 → 1 |
| Dark, shadow, perspective, tilt 4°, noise | 100% | 98.7–100% | 0 → 0 |
| Extra (one report): blur σ 2.0 / shake 5 px / shake 7 px / 42% size | – | 100% / 92% / 64% / 100% | |

On damaged photos all wrong values were flagged "please check" (32 of 32), and a "hard to read" message asks the person to compare
every value or retake the photo. Heavy blur and strong shake remain hard: a better photo is the real fix.
The 100 synthetic reports (`dataset/evaluate.py`) went from 97.9% to 98.4% fully correct (values 99.5%, recall 100%, precision 100%).
