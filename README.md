# Truyen Tool Config

Tool ReactJS de tao JSON lesson config cho truyen/hoi thoai, ho tro:
- Tao/sua `dialogue node` va `interaction node`
- Sinh audio bang ElevenLabs TTS
- Nghe lai audio truoc khi upload
- Upload background/audio len media server
- Xuat JSON theo schema bai hoc

## Chay project

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
```

## Cau truc JSON output

Output co 3 nhom chinh:
- Lesson metadata: `lessonId`, `background`, `characters[]`
- `dialogueNodes[]`:
  - Dialogue node: `id`, `speakerId`, `text`, `duration`, `audio`, `animations[]`, `next`
  - Interaction node: `id`, `speakerId`, `interactionData`, `responses`, `animations[]`
- `animations[]` -> `subActions[]`

## Huong dan su dung UI

### 1) Cau hinh upload server
Trong `Lesson Metadata`:
- `Upload API URL`
- `Token Header`
- `folder_path`
- `bucket`
- `description` (optional)

Chon file background o `Pick Background File` de upload len server.
Khi upload thanh cong, field `background` se duoc gan bang path/url tra ve.

### 2) Cau hinh ElevenLabs TTS
Trong `ElevenLabs TTS`:
- `ElevenLabs API Key`
- `Voice ID`
- `Model ID` (mac dinh: `eleven_multilingual_v2`)
- `Output Format` (mac dinh: `mp3_44100_128`)

### 3) Tao audio cho dialogue node
Tai `Node Editor` (dialogue node):
1. Nhap `Text` (hoac `TTS Text` custom)
2. Bam `Generate TTS`
3. Nghe lai qua audio player
4. Bam `Upload Audio` de day file len server

Luu y:
- Chi khi bam `Upload Audio` moi upload audio.
- Sau upload thanh cong, `audio` se la path/url server.
- `duration` se duoc cap nhat theo do dai audio sinh ra.

### 4) Dieu huong node
- `next`, `onSuccess`, `onFail`, `onTimeout` la dropdown
- Chi cho chon node ton tai
- Loai tru node hien tai de tranh self-reference

### 5) Rule duration cho subAction
Trong dialogue node:
- Tong `duration` cua tat ca `subAction` trong node khong duoc vuot qua `duration` cua node
- Neu vuot, gia tri moi se khong duoc ap dung va hien canh bao loi

## Loading states
Da co loading o cac buoc goi API:
- Upload background
- Generate TTS
- Upload audio

## Bao mat
- Khong hardcode token/API key trong source khi deploy
- Nen dung bien moi truong hoac backend proxy de bao ve credential

## File chinh
- `src/App.jsx`: toan bo logic editor UI, TTS va upload
- `src/config/animation-options.json`: cau hinh danh sach `characterIds`, `animations`, `expressions` cho dropdown trong subAction
