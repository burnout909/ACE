import subprocess
import numpy as np
from scipy import signal as _sp
from pipeline import config

def xcorr_offset(ref, other, rate):
    """Return (offset_sec, confidence). offset>0 => 'other' starts later than 'ref'."""
    a = ref - np.mean(ref)
    b = other - np.mean(other)
    corr = _sp.fftconvolve(b, a[::-1], mode="full")
    lags = np.arange(-len(a) + 1, len(b))
    idx = int(np.argmax(np.abs(corr)))
    lag = lags[idx]                       # b delayed by 'lag' samples vs a
    offset_sec = lag / rate
    peak = abs(corr[idx])
    denom = np.sqrt(np.sum(a * a) * np.sum(b * b)) or 1.0
    confidence = float(min(1.0, peak / denom))
    return offset_sec, confidence

def extract_audio(url, rate=None, window_sec=None):
    """Extract mono float32 PCM from the first window_sec via ffmpeg reading url directly."""
    rate = rate or config.SYNC_AUDIO_RATE
    window_sec = window_sec or config.SYNC_WINDOW_SEC
    cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-t", str(window_sec), "-i", url,
        "-vn", "-ac", "1", "-ar", str(rate),
        "-f", "f32le", "pipe:1",
    ]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype="<f4").copy()

def encounter_offsets(view_urls):
    rate = config.SYNC_AUDIO_RATE
    ref = extract_audio(view_urls[config.REFERENCE_VIEW], rate)
    result = {}
    for view, url in view_urls.items():
        if view == config.REFERENCE_VIEW:
            continue
        other = extract_audio(url, rate)
        n = min(len(ref), len(other))
        off, conf = xcorr_offset(ref[:n], other[:n], rate)
        result[view] = {"offset": off, "confidence": conf}
    return result
