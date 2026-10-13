/** MS-OVBA 2.4 CompressedContainer 읽기·쓰기. */

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

/** MS-OVBA 2.4.1.3.7 압축. 청크마다 앞쪽 4096바이트 안에서 가장 긴 반복을 찾아 CopyToken으로 바꾼다. */
export function compressOvba(plain: Uint8Array): Uint8Array {
  const out: number[] = [0x01];
  let pos = 0;
  do {
    const start = pos;
    const end = Math.min(start + 4096, plain.length);
    const chunk: number[] = [];
    while (pos < end) {
      const flagAt = chunk.length;
      let flags = 0;
      chunk.push(0);
      for (let bit = 0; bit < 8 && pos < end; bit++) {
        let bitCount = 4;
        while (1 << bitCount < pos - start) bitCount += 1;
        const maxLength = (0xffff >> bitCount) + 3;
        let bestLength = 0;
        let bestOffset = 0;
        for (let cand = pos - 1; cand >= start; cand--) {
          let len = 0;
          while (pos + len < end && len < maxLength && plain[cand + len] === plain[pos + len]) len += 1;
          if (len > bestLength) {
            bestLength = len;
            bestOffset = pos - cand;
            if (len === maxLength) break;
          }
        }
        if (bestLength >= 3) {
          const token = ((bestOffset - 1) << (16 - bitCount)) | (bestLength - 3);
          chunk.push(token & 0xff, (token >> 8) & 0xff);
          flags |= 1 << bit;
          pos += bestLength;
        } else {
          chunk.push(plain[pos]);
          pos += 1;
        }
      }
      chunk[flagAt] = flags;
    }
    if (chunk.length > 4096) {
      // 압축이 더 커지면 비압축 청크(헤더 0x3FFF, 정확히 4096바이트)로 쓴다.
      out.push(0xff, 0x3f);
      for (let i = 0; i < 4096; i++) out.push(start + i < plain.length ? plain[start + i] : 0);
      pos = start + 4096;
    } else {
      const header = 0xb000 | (chunk.length + 2 - 3);
      out.push(header & 0xff, header >> 8);
      for (const b of chunk) out.push(b);
    }
  } while (pos < plain.length);
  return Uint8Array.from(out);
}
