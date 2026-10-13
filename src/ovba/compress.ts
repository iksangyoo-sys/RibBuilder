/** MS-OVBA 2.4 CompressedContainer. 쓰기는 비압축 청크만 사용해 구현을 단순하게 유지한다. */

export function decompressOvba(data: Uint8Array): Uint8Array {
  let start = 0;
  if (data.length >= 2 && data[0] !== 0x01 && data[1] === 0x01) start = 1;
  if (data[start] !== 0x01) throw new Error("OVBA 압축 서명이 아닙니다.");
  let i = start + 1;
  const out: number[] = [];
  while (i + 1 < data.length) {
    const header = data[i] | (data[i + 1] << 8);
    i += 2;
    const compressed = (header & 0x8000) !== 0;
    const chunkSize = (header & 0x0fff) + 3;
    const chunkStart = i - 2;
    const chunkEnd = Math.min(data.length, chunkStart + chunkSize);
    const decompressedChunkStart = out.length;
    if (!compressed) {
      for (let n = 0; n < 4096 && i < data.length; n++) out.push(data[i++]);
      continue;
    }
    while (i < chunkEnd) {
      const flag = data[i++];
      for (let bit = 0; bit < 8 && i < chunkEnd; bit++) {
        if (((flag >> bit) & 1) === 0) {
          out.push(data[i++]);
        } else {
          if (i + 1 >= data.length) break;
          const token = data[i] | (data[i + 1] << 8);
          i += 2;
          const distance = out.length - decompressedChunkStart;
          let bitCount = 4;
          while (1 << bitCount < distance) bitCount += 1;
          const lengthMask = 0xffff >> bitCount;
          const offsetMask = ~lengthMask & 0xffff;
          const length = (token & lengthMask) + 3;
          const offset = ((token & offsetMask) >> (16 - bitCount)) + 1;
          for (let n = 0; n < length; n++) {
            out.push(out[out.length - offset] ?? 0);
          }
        }
      }
    }
  }
  return Uint8Array.from(out);
}

export function compressOvba(plain: Uint8Array): Uint8Array {
  const chunks: number[] = [0x01];
  let offset = 0;
  while (offset < plain.length) {
    const slice = plain.subarray(offset, offset + 4096);
    offset += slice.length;
    const padded = new Uint8Array(4096);
    padded.set(slice);
    const header = (4096 + 2 - 3) & 0x0fff; // uncompressed, flag 0
    chunks.push(header & 0xff, (header >> 8) & 0xff);
    for (let i = 0; i < 4096; i++) chunks.push(padded[i]);
  }
  if (plain.length === 0) {
    const header = (4096 + 2 - 3) & 0x0fff;
    chunks.push(header & 0xff, (header >> 8) & 0xff);
    for (let i = 0; i < 4096; i++) chunks.push(0);
  }
  return Uint8Array.from(chunks);
}
