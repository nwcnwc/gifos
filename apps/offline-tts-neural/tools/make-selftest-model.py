#!/usr/bin/env python3
"""Build vendor/selftest.onnx — a ~2 KB stand-in for the 24 MB KittenTTS model.

WHY THIS EXISTS. The real weights arrive by manifest pin from Hugging Face, so
without this the whole pipeline — phonemizer, tokenizer, voice table, ORT
session, WAV encoder, and the brokered provider loop — would only ever be
exercised on a machine with network, and never in the gate. That is precisely
the shape docs/providers.md warns about, and the same reason
apps/offline-llm-gemma4 ships make-demo-model.py.

It is NOT a voice and never pretends to be one. It takes the SAME three inputs
and returns a waveform, so every stage around it is real; it just makes a tone
instead of speech. All three inputs genuinely drive the output, so the plumbing
is actually proven rather than merely executed:

    duration  <- number of tokens   (tokenizer + phonemizer are wired)
    pitch     <- speed              (the speed input reaches the session)
    amplitude <- mean |style|       (the right voice row was selected)

The app only ever runs it when the caller asks for it explicitly
(`{ selftest: true }`). With the real weights missing and no such flag, the
provider FAILS LOUDLY instead — a consumer app must never be handed a beep and
left to think it was speech.

Usage (needs onnx + numpy):
    python3 -m venv venv && ./venv/bin/pip install onnx numpy
    ./venv/bin/python tools/make-selftest-model.py
"""
import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'vendor', 'selftest.onnx')

SR = 24000
PER_TOKEN = 1200          # samples of tone per token — ~0.05 s each
TAIL = 6000               # the app trims 5000 samples (the real model's tail);
                          # this keeps that subtraction positive for short text
BASE_HZ = 220.0

C = lambda name, v, t=TensorProto.FLOAT: helper.make_node(
    'Constant', [], [name], value=numpy_helper.from_array(np.array(v, dtype=np.float32 if t == TensorProto.FLOAT else np.int64), name))

nodes = [
    # ---- how many samples: token count drives duration ----------------------
    helper.make_node('Shape', ['input_ids'], ['ids_shape']),
    C('one_i', [1], TensorProto.INT64),
    C('zero_i', 0, TensorProto.INT64),
    C('step_i', 1, TensorProto.INT64),
    C('per_token_i', PER_TOKEN, TensorProto.INT64),
    C('tail_i', TAIL, TensorProto.INT64),
    helper.make_node('Gather', ['ids_shape', 'one_i'], ['n_tok'], axis=0),   # [1]
    helper.make_node('Mul', ['n_tok', 'per_token_i'], ['n_body']),
    helper.make_node('Add', ['n_body', 'tail_i'], ['n_tot_1']),
    helper.make_node('Squeeze', ['n_tot_1'], ['n_tot']),                    # scalar
    helper.make_node('Range', ['zero_i', 'n_tot', 'step_i'], ['idx']),
    helper.make_node('Cast', ['idx'], ['t'], to=TensorProto.FLOAT),

    # ---- pitch: the speed input reaches the session --------------------------
    C('two_pi_over_sr', 2.0 * np.pi / SR),
    C('base_hz', BASE_HZ),
    helper.make_node('Squeeze', ['speed'], ['speed_s']),
    helper.make_node('Mul', ['base_hz', 'speed_s'], ['hz']),
    helper.make_node('Mul', ['hz', 'two_pi_over_sr'], ['w']),
    helper.make_node('Mul', ['t', 'w'], ['phase']),
    helper.make_node('Sin', ['phase'], ['tone']),

    # ---- amplitude: the selected style row reaches the session ---------------
    helper.make_node('Abs', ['style'], ['style_abs']),
    helper.make_node('ReduceMean', ['style_abs'], ['style_mean'], keepdims=0),
    C('amp_floor', 0.20),
    C('amp_gain', 0.60),
    C('amp_cap', 0.90),
    helper.make_node('Mul', ['style_mean', 'amp_gain'], ['amp_raw']),
    helper.make_node('Add', ['amp_raw', 'amp_floor'], ['amp_1']),
    helper.make_node('Min', ['amp_1', 'amp_cap'], ['amp']),
    helper.make_node('Mul', ['tone', 'amp'], ['waveform']),

    # ---- second output, mirroring the real model's (input_ids, style, speed)
    #      -> (waveform, duration) signature -----------------------------------
    helper.make_node('Cast', ['n_tok'], ['duration'], to=TensorProto.FLOAT),
]

graph = helper.make_graph(
    nodes, 'kitten-selftest',
    [helper.make_tensor_value_info('input_ids', TensorProto.INT64, [1, 'N']),
     helper.make_tensor_value_info('style', TensorProto.FLOAT, [1, 256]),
     helper.make_tensor_value_info('speed', TensorProto.FLOAT, [1])],
    [helper.make_tensor_value_info('waveform', TensorProto.FLOAT, ['M']),
     helper.make_tensor_value_info('duration', TensorProto.FLOAT, [1])],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 18)],
                          producer_name='gifos-offline-tts-neural-selftest')

# IR VERSION IS THE TRAP, NOT THE OPSET. onnxruntime-web 1.20.1 refuses any
# model above IR 10, and it refuses it as a bare emscripten pointer — "8611368",
# no message, identical to an unsupported-op failure. Nine probes (Sin, Range,
# Min, ReduceMean, Squeeze, four opsets) ALL failed the same way before it
# turned out a one-node Abs graph failed too: the onnx package writes IR 13 by
# default, and only the IR check was ever firing. The real KittenTTS export is
# IR 9 / opset 20, which is why IT loads fine. Pin to the same IR the model we
# stand in for uses, and assert it, so a future `pip install -U onnx` cannot
# quietly reintroduce a failure that gives no reason for itself.
model.ir_version = 9
if model.ir_version > 10:
    raise SystemExit('ir_version %d exceeds what onnxruntime-web accepts (10)' % model.ir_version)
model.doc_string = ('Self-test stand-in for KittenTTS Nano. NOT a voice: a tone whose '
                    'duration, pitch and amplitude are driven by the token count, the '
                    'speed input and the selected style row, so the surrounding pipeline '
                    'is genuinely exercised offline. See tools/make-selftest-model.py.')
onnx.checker.check_model(model)
onnx.save(model, OUT)
print('wrote', os.path.relpath(OUT), os.path.getsize(OUT), 'bytes')
