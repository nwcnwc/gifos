#!/usr/bin/env python3
"""
make-selftest-model.py — the labelled stand-in model that rides INSIDE the GIF.

The real UVR weights are 120 MB of install-time asset download, which means the
app's whole DSP path — STFT, the plane layout, the chunker, the overlap-add,
the frequency-cut subtraction, the WAV writer — would be untestable offline and
ungated in CI. So the GIF also carries a tiny ONNX model of the SAME SHAPE that
passes its input straight through.

Because it is an identity, it makes the pipeline's own arithmetic assertable:
the "vocals" stem must come back as a band-limited copy of what went in, and
the "instrumental" stem (the frequency-cut mix minus it) must come back near
silent. Either one drifting means the port broke, not the model.

It is never presented as separation — app.js labels it and the store listing
does not mention it as a feature.

    python3 apps/vocal-remover/tools/make-selftest-model.py
"""
import os
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper

DIM_F, DIM_T = 1024, 256
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'vendor', 'selftest.onnx')

# Mul by a broadcast row of ones rather than an Identity node: ORT folds an
# Identity away, and then the self-test would prove the engine loaded rather
# than that it can run a kernel over a 4 x 1024 x 256 tensor.
gain = numpy_helper.from_array(np.ones((1, 1, DIM_F, 1), dtype=np.float32), name='gain')
node = helper.make_node('Mul', ['input', 'gain'], ['output'])
graph = helper.make_graph(
    [node], 'gifos-vocal-remover-selftest',
    [helper.make_tensor_value_info('input', TensorProto.FLOAT, ['batch_size', 4, DIM_F, DIM_T])],
    [helper.make_tensor_value_info('output', TensorProto.FLOAT, ['batch_size', 4, DIM_F, DIM_T])],
    [gain],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)])
model.ir_version = 6          # what the real UVR .onnx files carry
onnx.checker.check_model(model)
onnx.save(model, OUT)
print('wrote', os.path.relpath(OUT), '-', os.path.getsize(OUT), 'bytes')
