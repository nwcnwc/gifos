"""
A numpy reference for UVR's MDX-Net separation path, transcribed from
ultimatevocalremovergui/separate.py (SeperateMDX.demix / run_model) and
lib_v5/tfc_tdf_v3.py (STFT).  Used to generate fixtures for the JS port.
"""
import numpy as np

def hann_periodic(n):
    # torch.hann_window(n, periodic=True)
    return 0.5 - 0.5 * np.cos(2.0 * np.pi * np.arange(n) / n)

def stft(x, n_fft, hop):
    """torch.stft(center=True, return_complex=False, pad_mode='reflect'), per channel.
    x: (C, T) float32 -> (C, n_bins, n_frames) complex128"""
    w = hann_periodic(n_fft)
    pad = n_fft // 2
    xp = np.pad(x, ((0, 0), (pad, pad)), mode='reflect')
    n_frames = 1 + (xp.shape[-1] - n_fft) // hop
    out = np.empty((x.shape[0], n_fft // 2 + 1, n_frames), dtype=np.complex128)
    for f in range(n_frames):
        seg = xp[:, f * hop: f * hop + n_fft] * w
        out[:, :, f] = np.fft.rfft(seg, n=n_fft, axis=-1)
    return out

def istft(X, n_fft, hop):
    """torch.istft(center=True), per channel.  X: (C, n_bins, n_frames) -> (C, T)"""
    w = hann_periodic(n_fft)
    C, n_bins, n_frames = X.shape
    total = n_fft + hop * (n_frames - 1)
    y = np.zeros((C, total))
    env = np.zeros(total)
    for f in range(n_frames):
        seg = np.fft.irfft(X[:, :, f], n=n_fft, axis=-1) * w
        y[:, f * hop: f * hop + n_fft] += seg
        env[f * hop: f * hop + n_fft] += w * w
    pad = n_fft // 2
    y = y[:, pad: total - pad]
    env = env[pad: total - pad]
    env = np.where(np.abs(env) > 1e-11, env, 1.0)
    return y / env

class MDX:
    """The MDX-Net separator.  `run` takes the [1,4,dim_f,dim_t] spectrogram
    tensor and returns the model's prediction of the same shape."""
    def __init__(self, n_fft, dim_f, dim_t, compensate, run, hop=1024):
        self.n_fft, self.dim_f, self.dim_t = n_fft, dim_f, dim_t
        self.hop, self.compensate, self.run = hop, compensate, run
        self.trim = n_fft // 2
        self.chunk_size = hop * (dim_t - 1)
        self.n_bins = n_fft // 2 + 1

    def _spek(self, chunk):
        """STFT -> the model's 4-plane tensor.  chunk: (2, chunk_size)"""
        X = stft(chunk, self.n_fft, self.hop)          # (2, n_bins, dim_t)
        t = np.empty((4, self.n_bins, X.shape[-1]))
        t[0], t[1] = X[0].real, X[0].imag
        t[2], t[3] = X[1].real, X[1].imag
        t = t[:, :self.dim_f, :]
        t[:, :3, :] = 0.0                               # spek[:, :, :3, :] *= 0
        return t

    def _wave(self, t):
        """the model's 4-plane tensor -> waveform (2, chunk_size)"""
        full = np.zeros((4, self.n_bins, t.shape[-1]))
        full[:, :self.dim_f, :] = t
        X = np.empty((2, self.n_bins, t.shape[-1]), dtype=np.complex128)
        X[0] = full[0] + 1j * full[1]
        X[1] = full[2] + 1j * full[3]
        return istft(X, self.n_fft, self.hop)

    def demix(self, mix, is_match_mix=False):
        """mix: (2, T) float32 -> (2, T)"""
        if is_match_mix:
            # a FIXED 256-frame segment, whatever the model's dim_t is — this
            # pass never runs the model, so nothing ties it to dim_t
            chunk_size = self.hop * (256 - 1)
            overlap = 0.02
        else:
            chunk_size = self.chunk_size
            overlap = None                              # UVR's "Default"
        gen_size = chunk_size - 2 * self.trim
        pad = gen_size + self.trim - (mix.shape[-1] % gen_size)
        mixture = np.concatenate(
            (np.zeros((2, self.trim)), mix, np.zeros((2, pad))), 1)

        step = self.chunk_size - self.n_fft if overlap is None else int((1 - overlap) * chunk_size)  # self.chunk_size: the MODEL's
        result = np.zeros((1, 2, mixture.shape[-1]))
        divider = np.zeros((1, 2, mixture.shape[-1]))

        for i in range(0, mixture.shape[-1], step):
            start, end = i, min(i + chunk_size, mixture.shape[-1])
            actual = end - start
            window = None if overlap == 0 else np.tile(
                np.hanning(actual)[None, None, :], (1, 2, 1))
            part = mixture[:, start:end]
            if end != i + chunk_size:
                part = np.concatenate((part, np.zeros((2, i + chunk_size - end))), axis=-1)

            spek = self._spek(part)
            pred = spek if is_match_mix else self.run(spek[None])[0]
            tar = self._wave(pred)[None]                # (1, 2, chunk_size)

            if window is not None:
                tar[..., :actual] *= window
                divider[..., start:end] += window
            else:
                divider[..., start:end] += 1
            result[..., start:end] += tar[..., :end - start]

        tar = (result / divider)[:, :, self.trim:-self.trim]
        tar = np.concatenate(tar, axis=-1)[:, :mix.shape[-1]]
        source = tar[0:None] if tar.ndim == 2 else tar
        return source if is_match_mix else source * self.compensate
