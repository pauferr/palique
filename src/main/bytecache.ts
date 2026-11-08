// In-memory cache with a byte budget, least recently used out first (the GIF images, see
// index.ts). Map keeps insertion order: re-inserting on use moves an entry to the end.
export class ByteCache {
  private entries = new Map<string, { type: string; body: Uint8Array }>()
  bytes = 0
  private max: number

  constructor(max: number) {
    this.max = max
  }

  get(key: string): { type: string; body: Uint8Array } | undefined {
    const entry = this.entries.get(key)
    if (entry) {
      this.entries.delete(key)
      this.entries.set(key, entry)
    }
    return entry
  }

  set(key: string, entry: { type: string; body: Uint8Array }): void {
    const old = this.entries.get(key)
    if (old) {
      this.entries.delete(key)
      this.bytes -= old.body.byteLength
    }
    this.entries.set(key, entry)
    this.bytes += entry.body.byteLength
    for (const [k, e] of this.entries) {
      if (this.bytes <= this.max) break
      this.entries.delete(k)
      this.bytes -= e.body.byteLength
    }
  }
}
