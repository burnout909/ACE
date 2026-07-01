import numpy as np
from pipeline.sync import xcorr_offset

def _signal(n=48000, seed=0):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(n).astype(np.float32)

def test_xcorr_detects_known_positive_offset():
    rate = 16000
    ref = _signal(rate * 5)
    shift = 800  # samples = 0.05s; 'other' starts 0.05s later than ref
    other = np.concatenate([np.zeros(shift, np.float32), ref])[: ref.size]
    off, conf = xcorr_offset(ref, other, rate)
    assert abs(off - (shift / rate)) < 0.005
    assert conf > 0.5

def test_xcorr_zero_offset():
    rate = 16000
    ref = _signal(rate * 5)
    off, conf = xcorr_offset(ref, ref.copy(), rate)
    assert abs(off) < 0.005
    assert conf > 0.9

def test_xcorr_uncorrelated_low_confidence():
    rate = 16000
    off, conf = xcorr_offset(_signal(rate*5, 1), _signal(rate*5, 2), rate)
    assert conf < 0.3
