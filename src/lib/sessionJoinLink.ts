const MAX_QR_BYTES = 106;

/** Build a regular app landing URL. Only the public session code is carried. */
export function buildSessionJoinUrl(joinCode: string, baseHref: string): string {
  if (!/^\d{4}(?:\d{2})?$/.test(joinCode)) {
    throw new Error('A valid session code is required to build a join link.');
  }
  const base = new URL(baseHref);
  return `${base.origin}${base.pathname}#/?joinCode=${encodeURIComponent(joinCode)}`;
}

type Bits = number[];

function appendBits(target: Bits, value: number, length: number): void {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((value >>> bit) & 1);
}

function multiply(left: number, right: number): number {
  let product = 0;
  let a = left;
  let b = right;
  while (b !== 0) {
    if (b & 1) product ^= a;
    b >>>= 1;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return product;
}

function generatorPolynomial(degree: number): number[] {
  let polynomial = [1];
  for (let root = 0; root < degree; root += 1) {
    const next = Array<number>(polynomial.length + 1).fill(0);
    const alpha = (() => {
      let value = 1;
      for (let step = 0; step < root; step += 1) value = multiply(value, 2);
      return value;
    })();
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] = next[index]! ^ polynomial[index]!;
      next[index + 1] = next[index + 1]! ^ multiply(polynomial[index]!, alpha);
    }
    polynomial = next;
  }
  return polynomial;
}

function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const result = [...data, ...Array<number>(degree).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = result[index]!;
    if (factor === 0) continue;
    for (let coefficient = 0; coefficient < generator.length; coefficient += 1) {
      const target = index + coefficient;
      result[target] = result[target]! ^ multiply(generator[coefficient]!, factor);
    }
  }
  return result.slice(data.length);
}

function formatBits(mask: number): number {
  // Error correction level L has format value 01.
  const data = (1 << 3) | mask;
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((remainder >>> bit) & 1) !== 0) remainder ^= 0x537 << (bit - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function alignmentCenters(version: number): number[] {
  return version === 1 ? [] : [6, 10 + version * 4];
}

/** Encode an ASCII URL as a standards-compliant QR matrix (versions 1–5, L). */
export function qrCodeMatrix(value: string): readonly (readonly boolean[])[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.some((byte) => byte > 0x7f)) {
    throw new Error('The join link must use an ASCII URL.');
  }
  if (bytes.length > MAX_QR_BYTES) {
    throw new Error(`The join link is too long for this QR code (maximum ${MAX_QR_BYTES} bytes).`);
  }
  const versions = [
    { data: 19, ecc: 7 },
    { data: 34, ecc: 10 },
    { data: 55, ecc: 15 },
    { data: 80, ecc: 20 },
    { data: 108, ecc: 26 },
  ] as const;
  const versionIndex = versions.findIndex(({ data }) => bytes.length <= data - 2);
  const version = versionIndex + 1;
  if (versionIndex < 0) throw new Error('The join link is too long to encode.');
  const { data: dataCodewords, ecc: eccCodewords } = versions[versionIndex]!;

  const capacityBits = dataCodewords * 8;
  const payloadBits: Bits = [];
  appendBits(payloadBits, 0b0100, 4);
  appendBits(payloadBits, bytes.length, 8);
  for (const byte of bytes) appendBits(payloadBits, byte, 8);
  for (let count = Math.min(4, capacityBits - payloadBits.length); count > 0; count -= 1) {
    payloadBits.push(0);
  }
  while (payloadBits.length % 8 !== 0) payloadBits.push(0);
  const data = Array.from({ length: payloadBits.length / 8 }, (_, index) => {
    return payloadBits.slice(index * 8, index * 8 + 8).reduce((value, bit) => (value << 1) | bit, 0);
  });
  for (let pad = 0; data.length < dataCodewords; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
  const codewords = [...data, ...reedSolomonRemainder(data, eccCodewords)];
  const stream = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, bit) => (codeword >>> (7 - bit)) & 1));

  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const setFixed = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y]![x] = dark;
    reserved[y]![x] = true;
  };
  const drawFinder = (centerX: number, centerY: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const radius = Math.max(Math.abs(dx), Math.abs(dy));
        setFixed(centerX + dx, centerY + dy, radius !== 2 && radius !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  for (let coordinate = 8; coordinate < size - 8; coordinate += 1) {
    if (!reserved[6]![coordinate]) setFixed(coordinate, 6, coordinate % 2 === 0);
    if (!reserved[coordinate]![6]) setFixed(6, coordinate, coordinate % 2 === 0);
  }
  for (const centerY of alignmentCenters(version)) {
    for (const centerX of alignmentCenters(version)) {
      if (reserved[centerY]![centerX]) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFixed(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve both format-information copies and the fixed dark module.
  for (let index = 0; index <= 5; index += 1) setFixed(8, index, false);
  setFixed(8, 7, false);
  setFixed(8, 8, false);
  setFixed(7, 8, false);
  for (let index = 9; index < 15; index += 1) setFixed(14 - index, 8, false);
  for (let index = 0; index < 8; index += 1) setFixed(size - 1 - index, 8, false);
  for (let index = 8; index < 15; index += 1) setFixed(8, size - 15 + index, false);
  setFixed(8, size - 8, true);

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    const upward = ((right + 1) & 2) === 0;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y]![x]) continue;
        const bit = stream[bitIndex++] ?? 0;
        modules[y]![x] = (bit !== 0) !== ((x + y) % 2 === 0);
      }
    }
  }

  const format = formatBits(0);
  const getFormatBit = (index: number) => ((format >>> index) & 1) !== 0;
  for (let index = 0; index <= 5; index += 1) modules[index]![8] = getFormatBit(index);
  modules[7]![8] = getFormatBit(6);
  modules[8]![8] = getFormatBit(7);
  modules[8]![7] = getFormatBit(8);
  for (let index = 9; index < 15; index += 1) modules[8]![14 - index] = getFormatBit(index);
  for (let index = 0; index < 8; index += 1) modules[8]![size - 1 - index] = getFormatBit(index);
  for (let index = 8; index < 15; index += 1) modules[size - 15 + index]![8] = getFormatBit(index);
  modules[size - 8]![8] = true;
  return modules;
}
