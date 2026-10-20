"""Tests for room-presence stabilization (scripts/webcam_sensor.py).

Run with the project virtualenv:

    .venv/bin/python test/presence_stabilizer_test.py

Kept out of the Jest suite on purpose: the stabilizer is Python (it runs inside the
sensor process). Exit code is non-zero on failure so it can gate CI/scripts.
"""

import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "scripts"))

import webcam_sensor as w  # noqa: E402

RESULTS = []


def check(label, actual, expected):
    ok = actual == expected
    RESULTS.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {label:52s} -> {actual!r} (expected {expected!r})")


class FakeLandmark:
    def __init__(self, visibility):
        self.visibility = visibility


def make_pose(visibilities):
    return [FakeLandmark(v) for v in visibilities]


class FakePoseResult:
    def __init__(self, poses):
        self.pose_landmarks = poses


print("== PresenceStabilizer ==")

# Baseline is established after `confirm` samples and fires no event
s = w.PresenceStabilizer(window=5, confirm=3, cooldown=3.0)
check("no event while establishing baseline", s.add_sample(1, 0.0), None)
check("still no event on 2nd sample", s.add_sample(1, 0.1), None)
check("baseline set silently", s.add_sample(1, 0.2), None)
check("confirmed baseline", s.confirmed, 1)

# A single blip is not enough (needs `confirm` sustained samples)
check("blip sample 1 ignored", s.add_sample(2, 0.3), None)
check("blip sample 2 ignored", s.add_sample(1, 0.4), None)

# Baseline, then a sustained increase -> person_entered
s = w.PresenceStabilizer(window=3, confirm=2, cooldown=3.0)
for t in (0.0, 0.1, 0.2):
    s.add_sample(1, t)
check("single changed sample does not fire", s.add_sample(2, 1.0), None)
check("sustained change fires person_entered", s.add_sample(2, 1.1), ("person_entered", 2, 1))

# Sustained decrease (past the cooldown) -> person_left
event = None
for t in (5.0, 5.1, 5.2):
    e = s.add_sample(1, t)
    if e:
        event = e
check("sustained decrease fires person_left", event, ("person_left", 1, 2))

# Cooldown suppresses a rapid follow-up change
s2 = w.PresenceStabilizer(window=3, confirm=2, cooldown=5.0)
for t in (0.0, 0.1, 0.2):
    s2.add_sample(1, t)
first = None
for t in (1.0, 1.1, 1.2):
    e = s2.add_sample(2, t)
    if e:
        first = e
second = None
for t in (1.3, 1.4, 1.5):
    e = s2.add_sample(3, t)
    if e:
        second = e
check("first change fires", first, ("person_entered", 2, 1))
check("second change blocked by cooldown", second, None)

# Majority vote (ties favour the higher count)
s3 = w.PresenceStabilizer(window=5, confirm=2, cooldown=1.0)
for c in (1, 1, 2, 1, 1):
    s3.samples.append(c)
check("stable_count majority vote", s3.stable_count(), 1)
s3.samples.clear()
for c in (1, 2):
    s3.samples.append(c)
check("stable_count tie favours higher", s3.stable_count(), 2)

print("\n== count_visible_poses ==")
check("no result", w.count_visible_poses(None), 0)
check("empty poses", w.count_visible_poses(FakePoseResult([])), 0)
check("two clearly visible people",
      w.count_visible_poses(FakePoseResult([make_pose([0.9] * 33), make_pose([0.8] * 33)])), 2)
check("ghost pose ignored",
      w.count_visible_poses(FakePoseResult([make_pose([0.9] * 33), make_pose([0.1] * 33)])), 1)

total = len(RESULTS)
passed = sum(RESULTS)
print(f"\n{passed}/{total} passed")
sys.exit(0 if passed == total else 1)
