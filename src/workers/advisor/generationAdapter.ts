/** 수치 응답 요청 동안만 생성 adapter를 켠다. 워커 요청은 직렬로 실행한다. */
export const ADAPTER_GATES = ["lora_scale", "embed_scale", "qa_scale"] as const;
export type GenerationPurpose = "grounded-summary" | "grounded-numeric" | undefined;

export class GenerationAdapter {
  private inputs: readonly string[] = [];
  private purpose: GenerationPurpose;
  private running = false;

  setInputs(inputs: readonly string[]) {
    this.inputs = inputs;
    this.purpose = undefined;
    this.running = false;
  }

  values(): Record<string, number> {
    return Object.fromEntries(this.inputs.map((name) => [name,
      name === "qa_scale" && this.purpose === "grounded-numeric" ? 1 : 0]));
  }

  async run<T>(purpose: GenerationPurpose, operation: () => Promise<T>): Promise<T> {
    if (this.running) throw new Error("생성 요청은 한 번에 하나씩 실행해야 합니다");
    if (purpose === "grounded-numeric" && !this.inputs.includes("qa_scale")) {
      throw new Error("수치 응답용 모델이 준비되지 않았습니다");
    }
    this.running = true;
    this.purpose = purpose;
    try {
      return await operation();
    } finally {
      this.purpose = undefined;
      this.running = false;
    }
  }
}
