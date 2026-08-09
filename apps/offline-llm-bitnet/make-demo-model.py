#!/usr/bin/env python3
"""Build vendor/demo-model.gguf — the tiny in-GIF SELF-TEST model.

A real, loadable llama-architecture GGUF with a REAL tokenizer (the SPM llama
vocab that llama.cpp itself ships for its unit tests) and tiny RANDOM weights
(~2.3M parameters, deterministic seed). It exists so the app — and the release
gate — can prove the whole pipeline (engine boot in the sandboxed worker,
tokenize, generate, detokenize, the provider serve loop) with zero network and
a few MB, before/without the multi-GB BitNet download. It produces token soup
by design; the app labels it a self-test, never a brain.

Inputs:  a llama SPM vocab-only gguf (llama.cpp models/ggml-vocab-llama-spm.gguf)
Run:     python3 make-demo-model.py /path/to/ggml-vocab-llama-spm.gguf
Output:  vendor/demo-model.gguf (~4.4 MB, reproducible byte-for-byte)
"""
import sys
import os
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGMLQuantizationType, TokenType

VOCAB = sys.argv[1] if len(sys.argv) > 1 else 'ggml-vocab-llama-spm.gguf'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'demo-model.gguf')

DIM, LAYERS, HEADS, KV_HEADS, FF, CTX = 32, 2, 4, 4, 96, 512

r = GGUFReader(VOCAB)
f = {fl.name: fl for fl in r.fields.values()}
sval = lambda n: bytes(f[n].parts[f[n].data[0]]).decode('utf-8')
ival = lambda n: int(f[n].parts[f[n].data[0]][0])

tokens = [bytes(f['tokenizer.ggml.tokens'].parts[i]).decode('utf-8', 'replace')
          for i in f['tokenizer.ggml.tokens'].data]
scores = [float(f['tokenizer.ggml.scores'].parts[i][0]) for i in f['tokenizer.ggml.scores'].data]
ttypes = [int(f['tokenizer.ggml.token_type'].parts[i][0]) for i in f['tokenizer.ggml.token_type'].data]
n_vocab = len(tokens)
print(f'vocab: {n_vocab} tokens ({sval("tokenizer.ggml.model")})')

w = GGUFWriter(OUT, 'llama')
w.add_name('gifos-selftest-tiny')
w.add_context_length(CTX)
w.add_embedding_length(DIM)
w.add_block_count(LAYERS)
w.add_feed_forward_length(FF)
w.add_head_count(HEADS)
w.add_head_count_kv(KV_HEADS)
w.add_layer_norm_rms_eps(1e-5)
w.add_rope_dimension_count(DIM // HEADS)
w.add_vocab_size(n_vocab)
w.add_file_type(GGMLQuantizationType.F16)

w.add_tokenizer_model(sval('tokenizer.ggml.model'))
w.add_tokenizer_pre(sval('tokenizer.ggml.pre'))
w.add_token_list(tokens)
w.add_token_scores(scores)
w.add_token_types([TokenType(t) for t in ttypes])
w.add_bos_token_id(ival('tokenizer.ggml.bos_token_id'))
w.add_eos_token_id(ival('tokenizer.ggml.eos_token_id'))
w.add_unk_token_id(ival('tokenizer.ggml.unknown_token_id'))
w.add_add_bos_token(True)
w.add_add_eos_token(False)
# The simplest template minja can chew — role-tagged turns, nothing clever.
w.add_chat_template(
    "{% for m in messages %}{{ m['role'] }}: {{ m['content'] }}\n{% endfor %}assistant:")

rng = np.random.default_rng(20260809)  # deterministic — builds reproduce
t16 = lambda *shape: rng.standard_normal(shape, dtype=np.float32).astype(np.float16) * np.float16(0.05)
ones = lambda n: np.ones(n, dtype=np.float32)

w.add_tensor('token_embd.weight', t16(n_vocab, DIM))
for i in range(LAYERS):
    p = f'blk.{i}.'
    w.add_tensor(p + 'attn_norm.weight', ones(DIM))
    w.add_tensor(p + 'attn_q.weight', t16(DIM, DIM))
    w.add_tensor(p + 'attn_k.weight', t16(DIM, DIM))
    w.add_tensor(p + 'attn_v.weight', t16(DIM, DIM))
    w.add_tensor(p + 'attn_output.weight', t16(DIM, DIM))
    w.add_tensor(p + 'ffn_norm.weight', ones(DIM))
    w.add_tensor(p + 'ffn_gate.weight', t16(FF, DIM))
    w.add_tensor(p + 'ffn_down.weight', t16(DIM, FF))
    w.add_tensor(p + 'ffn_up.weight', t16(FF, DIM))
w.add_tensor('output_norm.weight', ones(DIM))
w.add_tensor('output.weight', t16(n_vocab, DIM))

w.write_header_to_file()
w.write_kv_data_to_file()
w.write_tensors_to_file()
w.close()
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
