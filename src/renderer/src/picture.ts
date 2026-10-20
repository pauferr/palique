// Center-crop a chosen picture to a 96×96 PNG, the size avatars are published at.
export async function avatarPng(file: File): Promise<Uint8Array> {
  const image = await createImageBitmap(file)
  const side = Math.min(image.width, image.height)
  const canvas = new OffscreenCanvas(96, 96)
  canvas
    .getContext('2d')!
    .drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 96, 96)
  const png = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await png.arrayBuffer())
}
