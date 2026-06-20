// STT(음성→텍스트) 제공자 어댑터 인터페이스.
//   향후 다른 제공자(Deepgram·AssemblyAI·Google 등)로 교체할 수 있도록
//   이 인터페이스만 구현하면 된다(src/lib/convert/stt/index.ts 에서 선택).
export interface SttResult {
  text: string;
  model: string;
}

export interface SttProvider {
  name: string;
  // 키 등 설정이 갖춰졌는지(미설정이면 변환을 시도하지 않고 '변환실패'로 처리).
  isConfigured(): boolean;
  // 오디오 바이트 → 전사 텍스트. 실패 시 throw.
  transcribe(buf: Buffer, filename: string, mime: string): Promise<SttResult>;
}
