import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/render';
import { CropDialog } from './CropDialog';
import { ASPECTS, UNCROPPED } from './ImageUpload';

/**
 * The crop maths, checked through the component rather than by eye.
 *
 * What matters is the *file that comes out*: its shape has to be the shape of
 * the frame, because everything downstream draws it with `object-cover` and
 * will trim anything that is not. A dialog that looks right and exports a
 * square for a banner slot is the bug this whole change exists to fix.
 */

/** jsdom has no canvas or ImageBitmap; both are stubbed to record what is asked of them. */
const drawn: Array<Record<string, number>> = [];
let canvasSize = { width: 0, height: 0 };

const stubGraphics = (source: { width: number; height: number }) => {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ ...source, close: vi.fn() })));
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvasSize = { width: this.width, height: this.height };
    return {
      imageSmoothingQuality: '',
      drawImage: (
        _img: unknown,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) => drawn.push({ sx, sy, sw, sh, dx, dy, dw, dh }),
    } as unknown as CanvasRenderingContext2D;
  });

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    cb: BlobCallback,
    type?: string,
  ) {
    cb(new Blob(['x'], { type: type ?? 'image/jpeg' }));
  } as HTMLCanvasElement['toBlob']);
};

/**
 * jsdom gives every element a zero size, so the frame has to be told one —
 * the component measures `clientWidth`/`clientHeight` to work out the crop.
 */
const sizeFrame = (w: number, h: number) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(h);
};

const file = (type = 'image/jpeg') => new File(['x'], `photo.${type.split('/')[1]}`, { type });

describe('positioning an image before it is uploaded', () => {
  beforeEach(() => {
    drawn.length = 0;
    canvasSize = { width: 0, height: 0 };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * The point of the whole change: a banner comes out 16/6, not square, even
   * though the source photograph is portrait.
   */
  it('writes a file the shape of the frame, not of the source', async () => {
    stubGraphics({ width: 1000, height: 2000 });
    sizeFrame(320, 120);
    const onCropped = vi.fn();

    render(
      <CropDialog file={file()} spec={ASPECTS.banner} onCancel={vi.fn()} onCropped={onCropped} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /use this/i }));
    await waitFor(() => expect(onCropped).toHaveBeenCalled());

    const ratio = canvasSize.width / canvasSize.height;
    expect(ratio).toBeCloseTo(ASPECTS.banner.ratio, 2);
  });

  /**
   * A tall source covering a wide frame is scaled to the frame's *width*, so
   * the slice taken is the full width and a band of the height. Getting this
   * backwards is the classic bug — it silently exports a sliver.
   */
  it('takes the full width of a portrait source for a wide frame', async () => {
    stubGraphics({ width: 1000, height: 2000 });
    sizeFrame(320, 120);

    render(<CropDialog file={file()} spec={ASPECTS.banner} onCancel={vi.fn()} onCropped={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /use this/i }));
    await waitFor(() => expect(drawn).toHaveLength(1));

    const { sx, sw, sh } = drawn[0];
    expect(sx).toBeCloseTo(0, 1);
    expect(sw).toBeCloseTo(1000, 0);
    // 320x120 frame at the cover scale (320/1000) samples 120/0.32 = 375px tall.
    expect(sh).toBeCloseTo(375, 0);
  });

  /** Never enlarge: a small logo blown up is just a blurry big logo. */
  it('does not upscale a source smaller than the target', async () => {
    stubGraphics({ width: 300, height: 300 });
    sizeFrame(300, 300);

    render(
      <CropDialog file={file()} spec={ASPECTS.product} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /use this/i }));
    await waitFor(() => expect(canvasSize.width).toBeGreaterThan(0));

    expect(canvasSize.width).toBe(300);
    expect(ASPECTS.product.maxWidth).toBeGreaterThan(300);
  });

  /**
   * Re-encoding a transparent PNG as JPEG fills the transparency with black,
   * which turns a logo meant for a white header into a black slab.
   */
  it('keeps PNG for anything that might be transparent', async () => {
    stubGraphics({ width: 800, height: 800 });
    sizeFrame(300, 300);
    const onCropped = vi.fn();

    render(
      <CropDialog
        file={file('image/png')}
        spec={ASPECTS.product}
        onCancel={vi.fn()}
        onCropped={onCropped}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /use this/i }));

    await waitFor(() => expect(onCropped).toHaveBeenCalled());
    expect(onCropped.mock.calls[0][0].type).toBe('image/png');
  });

  it('encodes a photograph as JPEG', async () => {
    stubGraphics({ width: 800, height: 800 });
    sizeFrame(300, 300);
    const onCropped = vi.fn();

    render(
      <CropDialog file={file()} spec={ASPECTS.product} onCancel={vi.fn()} onCropped={onCropped} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /use this/i }));

    await waitFor(() => expect(onCropped).toHaveBeenCalled());
    expect(onCropped.mock.calls[0][0].type).toBe('image/jpeg');
  });

  it('offers zoom, and escape closes it', async () => {
    stubGraphics({ width: 800, height: 800 });
    sizeFrame(300, 300);
    const onCancel = vi.fn();

    render(
      <CropDialog file={file()} spec={ASPECTS.product} onCancel={onCancel} onCropped={vi.fn()} />,
    );
    expect(await screen.findByRole('slider', { name: /zoom/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

/**
 * The frames have to match the elements the images land in. These are the pairs
 * that were wrong before — a banner framed as a square, a category framed one
 * way and drawn two others.
 */
describe('the shapes uploads are cropped to', () => {
  it('frames a banner as the storefront draws it, not as a square', () => {
    expect(ASPECTS.banner.ratio).toBeCloseTo(16 / 6, 3);
    expect(ASPECTS.banner.ratio).not.toBe(1);
  });

  it('frames a category as the one shape every category tile uses', () => {
    expect(ASPECTS.category.ratio).toBeCloseTo(4 / 3, 3);
  });

  it('frames a product square, which is what every product tile is', () => {
    expect(ASPECTS.product.ratio).toBe(1);
  });

  /**
   * A logo and a favicon are drawn with `object-contain` wherever they appear,
   * so there is no frame for them to fill and a crop could only take away
   * something their owner meant to keep. They are previewed and uploaded whole.
   *
   * Pinned by their absence from `ASPECTS`, because that is the map the upload
   * consults to decide whether to open the dialog at all — adding either back
   * to it would silently start cropping them.
   */
  it('never offers to crop a logo or a favicon', () => {
    expect(Object.keys(UNCROPPED).sort()).toEqual(['favicon', 'logo']);

    for (const name of Object.keys(UNCROPPED)) {
      expect(ASPECTS).not.toHaveProperty(name);
    }
  });
});
