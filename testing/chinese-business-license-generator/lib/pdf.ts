import { PDFDocument } from 'pdf-lib';

export async function imagesToPdf(images: Buffer[], pageSize = { width: 612, height: 792 }): Promise<Buffer> {
  const pdf = await PDFDocument.create();

  for (const imgBuf of images) {
    const png = await pdf.embedPng(imgBuf);
    const page = pdf.addPage([pageSize.width, pageSize.height]);
    const scale = Math.min(pageSize.width / png.width, pageSize.height / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    page.drawImage(png, {
      x: (pageSize.width - w) / 2,
      y: (pageSize.height - h) / 2,
      width: w,
      height: h,
    });
  }

  return Buffer.from(await pdf.save());
}
