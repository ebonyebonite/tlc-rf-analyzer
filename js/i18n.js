const DICT = {
  ja: {
    appTitle: 'TLC Rf 解析',
    langToggle: 'English',
    undo: '元に戻す (Ctrl+Z)',
    help: '使い方',
    zoomIn: '拡大', zoomOut: '縮小', fit: '全体を表示 (F)',
    stepImport: '読込', stepWarp: '面合わせ', stepScale: '縮尺', stepLines: '原点・先端', stepSpots: 'スポット', stepResults: '結果',
    prev: '戻る', next: '次へ', skip: 'スキップ',

    importTitle: '写真の読み込み',
    importDesc: '展開後のTLCプレートを撮った写真を選びます。ドラッグ＆ドロップや貼り付け（Ctrl+V）でも読み込めます。',
    chooseImage: '画像を選択', takePhoto: 'カメラで撮影', openSession: '保存した作業を開く',
    privacyNote: '画像はこの端末の中だけで処理され、どこにも送信されません。オフラインでも使えます。',
    emptyTitle: 'TLCプレートの写真を読み込んでください',
    emptyDesc: 'ここにドロップ、または貼り付け（Ctrl+V）',
    dropHere: 'ここにドロップして読み込み',
    loadedInfo: '{name}（{w} × {h} px）',
    loadFailed: '画像を読み込めませんでした。HEIC形式の場合はJPEGやPNGに変換してください。',
    sessionFailed: '作業ファイルを開けませんでした。',

    warpTitle: '面合わせ（台形補正）',
    warpDesc: '四隅の○をドラッグしてプレートの角に合わせます。ピンクの辺が溶媒先端側（上）になるよう、必要なら「90°回転」で向きを揃えてください。',
    autoDetect: '自動検出', rotate90: '90°回転', resetQuad: '画像全体',
    plateSize: 'プレートの実寸（任意）', plateW: '幅', plateH: '長さ（展開方向）',
    plateSizeNote: '入力すると補正後の縦横比が実寸どおりになり、縮尺にも使えます。',
    preview: '補正後のプレビュー', frontSide: '▲ 溶媒先端側（上）', originSide: '原点側',
    plateNotFound: 'プレートを自動検出できませんでした。四隅を手動で合わせてください。',
    warpFailed: '補正できませんでした。四隅の位置を確認してください。',

    scaleTitle: '縮尺の設定（任意）',
    scaleDesc: 'Rf値だけが必要なら設定は不要です。移動距離をmmで出したいときに設定します。',
    scaleNone: '設定しない（pxで表示）', scaleLine: '長さの分かる線に合わせる', scalePlate: 'プレートの実寸から',
    scaleLength: '線の長さ', scaleResult: '1 mm = {v} px', scaleNoneInfo: '距離は補正後画像のpxで表示します。',
    scalePlateMissing: '「面合わせ」でプレートの実寸を入力してください。',
    analysisPx: '補正後の画像',

    linesTitle: '原点と溶媒先端',
    linesDesc: 'オレンジの線を原点（スポットを打った線）に、青の線を溶媒先端に合わせます。端点のドラッグで傾きも合わせられます。',
    originLine: '原点', frontLine: '溶媒先端',
    distOF: '溶媒の移動距離: {v}',
    linesNotFound: '線を自動検出できなかった部分があります。手動で合わせてください。',

    spotsTitle: 'スポットの検出',
    spotsDesc: '「追加」ツールでスポットをタップすると、背景と色が違う範囲を自動で広げて重心を求めます。「スポット自動検出」はレーンごとにまとめて検出します。',
    toolAdd: '追加', toolSelect: '選択', toolLane: 'レーン', toolMeasure: 'ものさし', toolPan: '移動',
    detectLanes: 'レーン自動検出', detectSpots: 'スポット自動検出', clearSpots: 'すべて消去',
    params: '検出の設定', signalMode: '判定に使う色',
    sigDelta: '背景との色の差 (ΔE)', sigDark: '暗さ（明度の差）', sigHue: '参照色の色相方向',
    refColor: '参照色', pickRef: 'スポットから採取', pickRefFirst: '参照にするスポットをタップしてください',
    refWeak: 'その位置は背景とほとんど同じ色です。スポットの中心をタップしてください。',
    thr: '輪郭のしきい値（ピーク比）', sens: '自動検出の感度',
    centroid: '重心', cWeighted: '濃さで重み付け', cGeom: '形の中心',
    inLane: 'レーン幅の中だけで検出', laneWidth: 'レーン幅', auto: '自動',
    minArea: '最小面積 (px)', exclOrigin: '原点付近は自動検出しない', showMap: '検出信号を色で表示',
    lanes: 'レーン', noLanes: 'まだレーンはありません（スポットを追加すると自動で作られます）',
    laneName: 'レーン名', deleteLane: 'レーンとそのスポットを削除', nSpots: '{n} 個',
    distSpot: '移動距離', distFront: '溶媒', area: '面積', manualPos: '重心を手動で移動済み',
    resetCentroid: '重心を自動に戻す', deleteSpot: 'スポットを削除', delete: '削除', makeRef: '基準にする',
    spotNotFound: 'その位置にスポットが見つかりません。判定に使う色やしきい値を変えてみてください。',
    regionTooLarge: '検出範囲が広がりすぎました。しきい値を上げるか「レーン幅の中だけで検出」をオンにしてください。',
    lanesFound: '{n} レーンを検出しました', spotsFound: '{n} 個のスポットを検出しました',
    lanesNone: 'レーンを検出できませんでした。「レーン」ツールで位置をタップして追加してください。',
    needLines: '原点と溶媒先端を設定してください',
    rewarpCleared: '面合わせをやり直したため、スポットを消去しました',

    resultsTitle: '結果', sample: '試料名・メモ',
    colLane: 'レーン', colSpot: 'スポット', colDs: '移動距離', colDf: '溶媒移動距離', colRange: 'Rf範囲',
    noSpots: 'スポットがありません。「スポット」の手順で追加してください。',
    pxNote: '距離は補正後画像のpx単位です（縮尺未設定）。',
    manualTitle: 'ものさしによる計測',
    manualDesc: '「ものさし」で引いた線の長さを、基準線に対する比で表示します（基準を溶媒の移動距離にすればRf値）。',
    reference: '基準', colLen: '長さ', colRatio: '比',
    exportCsv: 'CSV保存', exportPng: '画像を保存', copyTable: '表をコピー', saveSession: '作業を保存',
    copied: 'コピーしました', saved: '保存しました',

    hint_import: '',
    hint_warp: '○をドラッグで四隅を合わせる ／ ホイール・ピンチで拡大 ／ 空いた所をドラッグで移動',
    hint_scale: '黄色の線の端をドラッグして、長さの分かるものに合わせます',
    hint_lines: '線の端点で傾き、線そのものをドラッグで平行移動',
    hint_results: 'ホイール・ピンチで拡大、ドラッグで移動',
    hintTool_add: 'スポットをタップして追加（ドラッグで表示を移動）',
    hintTool_select: 'タップで選択、重心の＋やレーン名をドラッグで調整',
    hintTool_lane: 'レーンを置きたい位置をタップ',
    hintTool_measure: 'ドラッグで線を引く（最初の線が基準）',
    hintTool_pan: 'ドラッグで表示を移動',
    hintTool_pick: '参照色にしたいスポットをタップ',

    helpTitle: '使い方',
    helpBody: `<ol>
      <li><b>読込</b> — 展開後のプレートの写真を選びます（UVランプ下の写真、発色後の写真どちらも可）。</li>
      <li><b>面合わせ</b> — 四隅を合わせて、斜めから撮った写真を正面から見た形に補正します。ピンクの辺が溶媒先端側です。</li>
      <li><b>縮尺</b>（任意） — mmで距離を出したい場合のみ。Rf値は縮尺に関係なく求まります。</li>
      <li><b>原点・先端</b> — 原点の線と溶媒先端の線を合わせます。Rf = 原点からスポット重心までの距離 ÷ 原点から溶媒先端までの距離（どちらも原点の線に垂直に測定）。</li>
      <li><b>スポット</b> — タップで追加するか自動検出します。背景との色の差が大きい範囲をスポットとし、その重心を求めます。</li>
      <li><b>結果</b> — 表をCSV・画像・クリップボードに出力。作業ファイルに保存して後から再開できます。</li>
    </ol>
    <h3>操作</h3>
    <ul>
      <li>拡大・縮小: マウスホイール / 2本指ピンチ / 右上のボタン</li>
      <li>表示の移動: 空いた所をドラッグ / 右ドラッグ / スペース＋ドラッグ / 2本指</li>
      <li>元に戻す: Ctrl+Z、選択したスポットの削除: Delete</li>
    </ul>
    <h3>うまく検出できないとき</h3>
    <ul>
      <li>「判定に使う色」を変える。UV下で暗く見えるスポットは「暗さ」、色の付いたスポットは「参照色の色相方向」が有効です。</li>
      <li>隣のレーンとつながる場合は「レーン幅の中だけで検出」をオンにし、レーン幅を調整します。</li>
      <li>「検出信号を色で表示」で、どこがスポットとして判定されているか確認できます。</li>
    </ul>`,
    close: '閉じる',
  },

  en: {
    appTitle: 'TLC Rf Analyzer',
    langToggle: '日本語',
    undo: 'Undo (Ctrl+Z)',
    help: 'Help',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to view (F)',
    stepImport: 'Import', stepWarp: 'Align', stepScale: 'Scale', stepLines: 'Origin/Front', stepSpots: 'Spots', stepResults: 'Results',
    prev: 'Back', next: 'Next', skip: 'Skip',

    importTitle: 'Import a photo',
    importDesc: 'Choose a photo of the developed TLC plate. You can also drag & drop or paste (Ctrl+V).',
    chooseImage: 'Choose image', takePhoto: 'Take photo', openSession: 'Open saved work',
    privacyNote: 'Images are processed only on this device and never uploaded. Works offline.',
    emptyTitle: 'Load a photo of a TLC plate',
    emptyDesc: 'Drop it here or paste (Ctrl+V)',
    dropHere: 'Drop to load',
    loadedInfo: '{name} ({w} × {h} px)',
    loadFailed: 'Could not load the image. Convert HEIC photos to JPEG or PNG.',
    sessionFailed: 'Could not open the work file.',

    warpTitle: 'Align the plate (perspective)',
    warpDesc: 'Drag the four circles onto the plate corners. Use “Rotate 90°” so the pink edge (solvent front side) is at the top.',
    autoDetect: 'Auto detect', rotate90: 'Rotate 90°', resetQuad: 'Whole image',
    plateSize: 'Plate size (optional)', plateW: 'Width', plateH: 'Length (development)',
    plateSizeNote: 'Sets the true aspect ratio of the rectified plate and can be used as the scale.',
    preview: 'Rectified preview', frontSide: '▲ Solvent front side (top)', originSide: 'Origin side',
    plateNotFound: 'Could not find the plate automatically. Place the corners by hand.',
    warpFailed: 'Could not rectify the plate. Check the corner positions.',

    scaleTitle: 'Scale (optional)',
    scaleDesc: 'Not needed for Rf values. Set it if you want distances in millimetres.',
    scaleNone: 'None (pixels)', scaleLine: 'Match a line of known length', scalePlate: 'From plate size',
    scaleLength: 'Line length', scaleResult: '1 mm = {v} px', scaleNoneInfo: 'Distances are shown in pixels of the rectified image.',
    scalePlateMissing: 'Enter the plate size in the Align step.',
    analysisPx: 'rectified image',

    linesTitle: 'Origin and solvent front',
    linesDesc: 'Put the orange line on the origin (where samples were spotted) and the blue line on the solvent front. Drag the end points to match any tilt.',
    originLine: 'Origin', frontLine: 'Solvent front',
    distOF: 'Solvent distance: {v}',
    linesNotFound: 'Some lines could not be detected. Adjust them by hand.',

    spotsTitle: 'Detect spots',
    spotsDesc: 'With “Add”, tap a spot: the region that differs from the background is grown automatically and its centroid is used. “Detect spots” finds all spots lane by lane.',
    toolAdd: 'Add', toolSelect: 'Select', toolLane: 'Lane', toolMeasure: 'Ruler', toolPan: 'Pan',
    detectLanes: 'Detect lanes', detectSpots: 'Detect spots', clearSpots: 'Clear all',
    params: 'Detection settings', signalMode: 'Colour used',
    sigDelta: 'Colour difference from background (ΔE)', sigDark: 'Darkness (lightness drop)', sigHue: 'Hue of a reference colour',
    refColor: 'Reference', pickRef: 'Pick from a spot', pickRefFirst: 'Tap a spot to use as the reference colour',
    refWeak: 'That point looks like the background. Tap the centre of a spot.',
    thr: 'Outline threshold (fraction of peak)', sens: 'Auto-detect sensitivity',
    centroid: 'Centroid', cWeighted: 'Intensity-weighted', cGeom: 'Shape centre',
    inLane: 'Keep spots inside the lane', laneWidth: 'Lane width', auto: 'Auto',
    minArea: 'Minimum area (px)', exclOrigin: 'Ignore spots at the origin when auto-detecting', showMap: 'Show detection signal',
    lanes: 'Lanes', noLanes: 'No lanes yet (one is created when you add a spot)',
    laneName: 'Lane name', deleteLane: 'Delete lane and its spots', nSpots: '{n} spots',
    distSpot: 'Distance', distFront: 'solvent', area: 'Area', manualPos: 'centroid moved by hand',
    resetCentroid: 'Reset centroid', deleteSpot: 'Delete spot', delete: 'Delete', makeRef: 'Use as reference',
    spotNotFound: 'No spot found there. Try another colour mode or threshold.',
    regionTooLarge: 'The region grew too large. Raise the threshold or keep spots inside the lane.',
    lanesFound: 'Found {n} lanes', spotsFound: 'Found {n} spots',
    lanesNone: 'No lanes found. Use the Lane tool and tap where lanes are.',
    needLines: 'Set the origin and solvent front first',
    rewarpCleared: 'The plate was re-aligned, so spots were cleared',

    resultsTitle: 'Results', sample: 'Sample / note',
    colLane: 'Lane', colSpot: 'Spot', colDs: 'Distance', colDf: 'Solvent distance', colRange: 'Rf range',
    noSpots: 'No spots yet. Add them in the Spots step.',
    pxNote: 'Distances are in pixels of the rectified image (no scale set).',
    manualTitle: 'Ruler measurements',
    manualDesc: 'Lengths of lines drawn with the Ruler, as a ratio to the reference line (use the solvent distance as reference to get Rf).',
    reference: 'Ref.', colLen: 'Length', colRatio: 'Ratio',
    exportCsv: 'Save CSV', exportPng: 'Save image', copyTable: 'Copy table', saveSession: 'Save work',
    copied: 'Copied', saved: 'Saved',

    hint_import: '',
    hint_warp: 'Drag circles to the corners · wheel / pinch to zoom · drag empty space to pan',
    hint_scale: 'Drag the ends of the yellow line onto something of known length',
    hint_lines: 'Drag end points to tilt, drag a line to move it',
    hint_results: 'Wheel / pinch to zoom, drag to pan',
    hintTool_add: 'Tap a spot to add it (drag to pan)',
    hintTool_select: 'Tap to select · drag a centroid or lane label to adjust',
    hintTool_lane: 'Tap where a lane should be',
    hintTool_measure: 'Drag to draw a line (the first one is the reference)',
    hintTool_pan: 'Drag to pan',
    hintTool_pick: 'Tap a spot to use its colour',

    helpTitle: 'How to use',
    helpBody: `<ol>
      <li><b>Import</b> — choose a photo of the developed plate (under a UV lamp or after staining).</li>
      <li><b>Align</b> — place the four corners to correct a photo taken at an angle. The pink edge is the solvent-front side.</li>
      <li><b>Scale</b> (optional) — only for distances in mm. Rf does not depend on the scale.</li>
      <li><b>Origin/Front</b> — match the origin line and the solvent front. Rf = origin→spot centroid ÷ origin→solvent front, both measured perpendicular to the origin line.</li>
      <li><b>Spots</b> — tap to add, or detect automatically. A spot is the region whose colour differs from the background; its centroid is used.</li>
      <li><b>Results</b> — export as CSV, an annotated image or to the clipboard. Save your work to continue later.</li>
    </ol>
    <h3>Controls</h3>
    <ul>
      <li>Zoom: mouse wheel / pinch / buttons at top right</li>
      <li>Pan: drag empty space / right-drag / Space + drag / two fingers</li>
      <li>Undo: Ctrl+Z · delete selected spot: Delete</li>
    </ul>
    <h3>If detection struggles</h3>
    <ul>
      <li>Change “Colour used”: “Darkness” for dark spots under UV, “Hue of a reference colour” for coloured spots.</li>
      <li>If neighbouring lanes merge, keep spots inside the lane and adjust the lane width.</li>
      <li>“Show detection signal” shows what is being treated as a spot.</li>
    </ul>`,
    close: 'Close',
  },
};

let lang = 'ja';

export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem('tlc-rf-lang'); } catch { /* storage unavailable */ }
  lang = saved === 'ja' || saved === 'en' ? saved : (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  document.documentElement.lang = lang;
}

export const getLang = () => lang;

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('tlc-rf-lang', l); } catch { /* storage unavailable */ }
  document.documentElement.lang = l;
  applyI18n();
}

export function t(key, params) {
  let s = DICT[lang][key] ?? DICT.ja[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
  return s;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  });
  document.title = t('appTitle');
}
