"""원본 q4 ONNX 그래프에 kev LoRA 를 덧붙인다 — 원본 가중치 파일은 그대로, 변경분만 따로.

브라우저는 원본 가중치(`model_q4.onnx_data`, 약 550MB)를 지금처럼 onnx-community 에서 받고, 여기서 만든
두 파일만 우리 사이트에서 받는다.

  model_q4.onnx            그래프 하나(원본 + LoRA 연산 + 은닉 상태 출력, LoRA 가중치 fp16 을 안에 싣는다, 약 22MB).
                           원본 가중치는 `model_q4.onnx_data` 를 이름으로 가리킨다 — 브라우저는 그 파일을 원래 곳에서 받는다

MatMulNBits(q4) 마다  y = MatMulNBits(x) + lora_scale · (x · A^T) · (B^T · alpha/r)  를 더한다. 재양자화가 없어 LoRA 가
정확히 들어간다. `lora_scale` 은 입력이다 — 워커가 생성에는 0(원본 그대로), 판정에는 1 을 넣는다.
은닉 상태 출력 `hidden` 은 lm_head 바로 앞(최종 정규화 뒤, num_logits_to_keep 로 자른 것)이다. kev 헤드가 읽는 값이다.

  python3 lora_onnx.py <원본 model_q4.onnx> <adapter 폴더> <출력 폴더>
"""
import json, os, sys
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from safetensors.numpy import load_file

src, adapter, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
DTYPE = np.float16

cfg = json.load(open(os.path.join(adapter, "adapter_config.json")))
scale = cfg["lora_alpha"] / cfg["r"]
w = load_file(os.path.join(adapter, "adapter_model.safetensors"))

m = onnx.load(src, load_external_data=False)
g = m.graph
# 원본 가중치는 원래 파일 이름 그대로 가리킨다(같은 폴더에 두면 된다)
consumers = {}
for n in g.node:
    for i in n.input:
        consumers.setdefault(i, []).append(n)

total = 0
def external(name, arr):
    """이름은 옛것 그대로 두었다 — 지금은 그래프 안에 싣는다(파일 하나로 내려받게)."""
    global total
    arr = np.ascontiguousarray(arr.astype(DTYPE))
    g.initializer.append(numpy_helper.from_array(arr, name))
    total += arr.nbytes

# 판정만 LoRA 를 켠다. 꼭 넣어야 하는 입력이다 — ONNX Runtime Web 은 기본값 있는 입력(초기값을 가진 그래프 입력)에
# 값을 넣으면 거절한다. 워커가 transformers.js 에게는 이 입력을 숨기고 0 을 채워 준다(생성은 원본 그대로).
g.input.append(helper.make_tensor_value_info("lora_scale", TensorProto.FLOAT, []))

new_nodes = []
done = 0
for n in list(g.node):
    new_nodes.append(n)
    if n.op_type != "MatMulNBits" or n.name.startswith("/lm_head"):
        continue
    # "/model/layers.3/mlp/down_proj/MatMul_Quant" → "layers.3.mlp.down_proj", ONNX 이름 gdn·attn ↔ HF linear_attn·self_attn
    path = n.name.split("/")[2:-1]
    layer, block, proj = path[0], path[1], path[2]
    block = {"gdn": "linear_attn", "attn": "self_attn"}.get(block, block)
    key = f"base_model.model.{layer}.{block}.{proj}"
    A, B = w[f"{key}.lora_A.weight"], w[f"{key}.lora_B.weight"]   # A [r,K], B [N,r]
    tag = key.replace(".", "_")
    external(f"{tag}_lora_AT", A.T)                    # [K, r]
    external(f"{tag}_lora_BT", (B.T * scale))          # [r, N]
    x, y = n.input[0], n.output[0]
    base_y = y + "_base"
    n.output[0] = base_y
    cast_x = helper.make_node("Cast", [x], [f"{tag}_x16"], to=TensorProto.FLOAT16, name=f"{tag}_cast_in")
    mm1 = helper.make_node("MatMul", [f"{tag}_x16", f"{tag}_lora_AT"], [f"{tag}_xa"], name=f"{tag}_lora_a")
    mm2 = helper.make_node("MatMul", [f"{tag}_xa", f"{tag}_lora_BT"], [f"{tag}_d16"], name=f"{tag}_lora_b")
    cast_d = helper.make_node("Cast", [f"{tag}_d16"], [f"{tag}_d"], to=TensorProto.FLOAT, name=f"{tag}_cast_out")
    gate = helper.make_node("Mul", [f"{tag}_d", "lora_scale"], [f"{tag}_ds"], name=f"{tag}_lora_gate")
    add = helper.make_node("Add", [base_y, f"{tag}_ds"], [y], name=f"{tag}_lora_add")
    new_nodes += [cast_x, mm1, mm2, cast_d, gate, add]
    done += 1

del g.node[:]
g.node.extend(new_nodes)
assert done == len({k.split(".lora_")[0] for k in w}), (done, len(w))

# 은닉 상태 출력
hidden = [n for n in g.node if n.name == "/lm_head/MatMul_Quant"][0].input[0]
g.output.append(helper.make_tensor_value_info(hidden, TensorProto.FLOAT, ["batch_size", "num_logits_to_keep", 1024]))
# 이름을 알기 쉽게: hidden 이라는 별칭
g.node.append(helper.make_node("Identity", [hidden], ["hidden"], name="hidden_out"))
g.output[-1].name = "hidden"

onnx.save(m, os.path.join(out, "model_q4.onnx"))
print(f"LoRA {done}곳, 가중치 {total / 1e6:.1f}MB, 그래프 {os.path.getsize(os.path.join(out, 'model_q4.onnx')) / 1e6:.1f}MB")
