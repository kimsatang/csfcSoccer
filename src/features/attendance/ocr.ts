/**
 * 카톡 투표 스크린샷 글자 인식 (브라우저에서 처리, 이미지는 서버로 보내지 않음)
 *
 * 같은 이미지를 두 가지로 인식한다:
 *  - raw: 원본 그대로
 *  - prep: 2배 확대 + 흑백 이진화 (손글씨풍 폰트·색 배경 프로필 옆 글자 보완)
 * 두 결과를 parseNames → mergeResults로 합치면 한쪽에서 놓친 이름을 다른 쪽이 잡아 준다.
 * tesseract.js와 한국어 데이터(약 1.5MB)는 처음 쓸 때만 내려받는다.
 */

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('kor'))
    workerPromise.catch(() => { workerPromise = null })
  }
  return workerPromise
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    // decode 이후에는 URL을 해제해도 그려진 이미지는 유지됨
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/** 2배 확대 + 흑백 이진화 */
function preprocess(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(2, 3000 / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  const px = d.data
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    const v = g > 150 ? 255 : 0
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(d, 0, 0)
  return c
}

export interface OcrOutput {
  /** 원본 인식 글 (이미지 순서대로 이어 붙임) */
  raw: string
  /** 보정본 인식 글 */
  prep: string
}

/** 여러 장의 스크린샷을 순서대로 인식 */
export async function recognizeScreenshots(files: File[], onProgress?: (done: number, total: number) => void): Promise<OcrOutput> {
  const total = files.length * 2
  let done = 0
  const tick = () => onProgress?.(done, total)
  tick()
  const worker = await getWorker()
  const raw: string[] = []
  const prep: string[] = []
  for (const f of files) {
    const img = await loadImage(f)
    raw.push((await worker.recognize(img)).data.text)
    done++; tick()
    prep.push((await worker.recognize(preprocess(img))).data.text)
    done++; tick()
  }
  return { raw: raw.join('\n'), prep: prep.join('\n') }
}
