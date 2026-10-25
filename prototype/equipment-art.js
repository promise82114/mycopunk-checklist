// 簡化外觀示意，依 Wiki 裝備圖參考重繪；不是遊戲原圖或精確模型。
// 參考日期、各項辨識特徵及來源見 research/equipment-art.md。
// 幾何皆為本站程式碼，不載入外部圖片，也不影響配件格形資料。
const portraits = {
  wrangler: ['#a74b51', '#9bd76a', `
    <path fill="primary" d="M37 130l6-30 27-13h42l35 15 13 28z"/>
    <path fill="#542f39" d="M52 100l25-12 16 19 19-19 27 12-23 15 13 15H66l8-15z"/>
    <path d="M85 88v38m17-37v37"/><path fill="#929a91" d="M78 75h30v26H78z"/>
    <path fill="primary" d="M70 43l13-13 32 4 9 19-8 35-16 7-25-16z"/>
    <path fill="secondary" d="M98 43l21 7-5 31-14 8-7-21z"/>
    <path fill="#513f35" d="M47 39l17-6 8-22 27-5 23 12 5 16 31 9-32 8-54-6z"/>
    <path fill="none" stroke="#c3a279" d="M66 34l56 4"/>
    <path fill="none" d="M58 119c-13-20-28-1-13 10m79-21 19 7-7 15"/>
  `],
  bruiser: ['#598aa3', '#b9e2ed', `
    <path fill="primary" d="M30 127V91l17-19h103l21 20v35z"/>
    <path fill="#3e6276" d="M29 87l25-4 8 43H25zm116-4 27 9 2 34h-34z"/>
    <path fill="primary" d="M53 40l17-20 43-6 27 18 5 43-21 27-40 5-30-25z"/>
    <circle cx="100" cy="60" r="31" fill="#b4c9ce"/>
    <path fill="#293c42" d="M73 47l12-7 11 17-7 16-15-7zm49-4 8 15-6 13-17-4 1-17z"/>
    <circle cx="83" cy="54" r="4" fill="secondary" stroke="none"/><circle cx="119" cy="55" r="4" fill="secondary" stroke="none"/>
    <circle cx="99" cy="80" r="7" fill="#596a71"/><path d="M70 28l3-13m43 4 6-9M39 94v22m120-21 5 20"/>
    <path fill="none" stroke="#cdb65c" d="M58 40l-6 7 8 11m-2 7-8 4 8 13"/>
  `],
  scrapper: ['#d4a32e', '#8bafb7', `
    <path fill="primary" d="M37 129l7-30 24-12h58l28 15 9 27z"/>
    <path fill="#5c5140" d="M66 88l15 14h29l16-14 10 42H61z"/>
    <path fill="primary" d="M57 70l16 12 20 17-13 19-26-17-11-18zm79 3 17 22-22 19-20-14z"/>
    <path fill="#676e65" d="M86 66h23v30H86z"/>
    <path fill="secondary" d="M69 32l18-16 31 6 14 16-1 26-21 11-36-9z"/>
    <path fill="#b9cdd0" d="M72 33l39 9 21-4-20-15-22-7z"/>
    <path fill="#364e53" d="M76 51l36 9 16-5-2 12-17 8-31-12z"/>
    <path fill="none" stroke="#e3bf68" d="M82 63l12 22 18-12"/>
    <path fill="#bdc7c3" d="M88 109h14v21H88zm20-6h8v27h-8z"/>
    <path d="M42 112l-7-28m111 30 16-26"/>
  `],
  glider: ['#77a76a', '#9ddd6b', `
    <path fill="#e5eae2" d="M21 130l27-42 32 15h37l31-16 32 43z"/>
    <path fill="primary" d="M48 89l16 41H25zm101 0-15 41h41z"/>
    <path fill="primary" d="M67 129V99l25-9 26 9 11 30z"/>
    <ellipse cx="98" cy="101" rx="29" ry="10" fill="#566b51"/>
    <path fill="#e8eee4" d="M62 37l17-21 34 3 26 24-4 37-28 13-32-15z"/>
    <path fill="secondary" d="M83 44l50-1-3 29-22 11-25-14z"/>
    <path fill="primary" d="M72 33L58 17l27 13 3 9zm18-8-7-15 21 18 2 9zm15-5 1-13 15 24-6 5z"/>
    <path fill="#364e40" d="M59 67l-10 8 6 21 11-5zm77 1 12 6-7 22-10-4z"/>
    <path fill="none" d="M35 115l12 8m104-9 12 10"/>
  `],
  mycologist: ['#8c66a3', '#7cbdb7', `
    <path fill="primary" d="M43 130l7-29 29-17h37l28 21 10 25z"/>
    <circle cx="53" cy="117" r="18" fill="#55475f"/><circle cx="53" cy="117" r="10" fill="primary"/>
    <path fill="#a0a7a9" d="M92 66h17v32H92z"/><path d="M94 85h14"/>
    <path fill="primary" d="M69 28l21-15 30 8 15 24-10 29-28 7-25-20z"/>
    <ellipse cx="112" cy="48" rx="24" ry="30" fill="#e3dbe6"/>
    <ellipse cx="113" cy="48" rx="13" ry="20" fill="#3e3749"/>
    <path fill="#bbb5c6" d="M77 52L48 74l-7-5 34-26z"/>
    <path fill="secondary" d="M127 103l9-18 8 15 15-9 1 19 15 6-14 9 1 5h-37z"/>
    <path fill="#c2a5c8" d="M141 111l5-13 9 10-4 11zm16 13 8-8 4 12z" stroke="none"/>
  `],
  cycler: ['#568da2', '#dda74e', `
    <path fill="primary" d="M18 61h39v14L18 92zm35-8h69v28H53z"/>
    <path fill="#c2d4d8" d="M59 43h40v10H59z"/>
    <path fill="secondary" d="M122 57h60v9h-60zm0 17h48v8h-48z"/>
    <path fill="none" stroke="#ad7136" d="M123 60l38 17 19-17m-51 20 28-17"/>
    <path fill="#69808c" d="M88 80h18l-9 24H80zm-23 0h11l-6 17H59z"/>
    <path fill="secondary" d="M61 62h52v7H61z" stroke="none"/>
    <path d="M25 67v12m83-22v17"/>
  `],
  jackrabbit: ['#6b7475', '#c8a15a', `
    <path fill="#80664b" d="M16 84l40-17 12 14-27 23-25 1z"/>
    <path fill="primary" d="M56 58h119l8 8-4 16H69L56 75z"/>
    <path fill="secondary" d="M66 60h17v20H66z"/><circle cx="75" cy="69" r="6" fill="#6c604b"/>
    <path fill="secondary" d="M87 51h7v8h-7zm16 0h7v8h-7zm16 0h7v8h-7zm16 0h7v8h-7zm16 0h7v8h-7zm16 0h7v8h-7z"/>
    <path fill="#384b50" d="M98 63h73v11H98z"/>
    <path fill="none" stroke="secondary" d="M72 83l-13 13m19-11-12 14m17-13-9 14"/>
    <path fill="none" d="M77 80l13 9h16l8-8"/>
  `],
  'swarm-launcher': ['#a65352', '#db9380', `
    <path fill="primary" d="M15 61l20-7 22 6v24l-22 1-16-9zm39-2 21-9h63l30 13 16 4-3 16h-35l-19 8H73L54 80z"/>
    <path fill="secondary" d="M74 61h69l-12 19H77z"/>
    <path fill="none" d="M73 54l10-8h36l10 8M63 85l-5 20H44l4-21M141 61v22m13-18v15"/>
    <path fill="#5e4344" d="M164 69h18v8h-18z"/>
    <path fill="none" stroke="#f3c3ae" d="M82 70h46"/>
  `],
  dmlr: ['#d7d7cd', '#c8b578', `
    <path fill="primary" d="M18 57h39v25H18l9-25zm16 6-7 14h22V63z" fill-rule="evenodd"/>
    <circle cx="84" cy="69" r="29" fill="primary"/>
    <circle cx="84" cy="69" r="21" fill="#9aa9b8"/><circle cx="84" cy="69" r="13" fill="#b6a8d6"/>
    <circle cx="84" cy="69" r="4" fill="#eeeaf5"/><circle cx="76" cy="62" r="3" fill="#eeeaf5"/><circle cx="91" cy="62" r="3" fill="#eeeaf5"/><circle cx="77" cy="77" r="3" fill="#eeeaf5"/><circle cx="92" cy="77" r="3" fill="#eeeaf5"/>
    <path fill="primary" d="M109 57h74v22h-74z"/>
    <path fill="none" d="M118 62v12m9-12v12m9-12v12m9-12v12m9-12v12m9-12v12m9-12v12"/>
    <path fill="none" stroke="secondary" d="M34 84c22 24 74 21 87-5"/>
  `],
  'lead-flinger': ['#8c8071', '#c3b39b', `
    <path fill="primary" d="M44 54h29l8-7h78v14l-12 12H77l-9 12H51L40 72z"/>
    <path fill="#61554f" d="M45 80h22l-8 17 7 13-11 10-15-12 3-16z"/>
    <ellipse cx="82" cy="63" rx="17" ry="19" fill="secondary"/>
    <path fill="none" d="M76 47v31m12-31v31m12-25h52m-39 1v16m16-16v16m16-16v14M65 83h24l7-11"/>
    <path fill="secondary" d="M106 43h7v8h-7zm38 0h8v8h-8z"/>
  `],
  'plate-launcher': ['#a59a7c', '#d1a661', `
    <path fill="primary" d="M33 72h144v21H33z"/><path fill="#5a5751" d="M111 78h72v18h-72z"/>
    <path fill="secondary" d="M51 48l14-9 15 4 7 18-24 8zM75 59h32v8H75z"/>
    <circle cx="48" cy="77" r="24" fill="#d9dcd1"/><circle cx="48" cy="77" r="15" fill="#a6afa6"/>
    <path fill="none" d="M24 68l-8 5 9 4-7 8 12 1m32 9-4 10-9-8-7 8-3-7m43-30h60M102 73v22m8-22v22"/>
    <path fill="secondary" d="M123 62h40v13h-40z"/><path d="M130 67h24"/>
  `],
  'gunship-cannon': ['#6e8c8a', '#d0a382', `
    <path fill="primary" d="M20 49h71v41H20l-7-12V61z"/>
    <path fill="#a9bfbc" d="M91 55h86v12H91zm0 19h86v13H91z"/>
    <path fill="#40565b" d="M169 52h15v18h-15zm0 19h15v19h-15z"/>
    <path fill="secondary" d="M81 46h12v47H81zM17 53h7v34h-7z"/>
    <path fill="none" stroke="primary" stroke-width="7" d="M72 86c-22 2-27 9-29 20m38-20c-23 4-28 11-28 20m38-20c-25 5-28 13-27 20"/>
    <path fill="none" d="M32 58h37m-37 8h28m-28 8h17"/>
  `],
  trident: ['#4d687e', '#c9ad67', `
    <path fill="primary" d="M15 56l31 6h26v24H44l-27 7 2-13 15-5-17-7zm53-1h85v34H68z"/>
    <path fill="primary" d="M116 48h67v10h-67zm0 16h67v10h-67zm0 16h67v10h-67z"/>
    <path fill="secondary" d="M76 54h7v31h-7zm13 0h7v31h-7zm14 0h7v31h-7zm29 36h11v18h-11z"/>
    <path fill="#46555a" d="M94 87h18l-6 20H93z"/>
    <path fill="none" stroke="secondary" d="M51 84c5 20 35 17 37 4"/>
  `],
  globbler: ['#729942', '#b4cf5b', `
    <path fill="primary" d="M18 60h41v21H35l-10 16H15l6-24zM107 59h67l9 10-8 17h-66z"/>
    <circle cx="86" cy="71" r="29" fill="primary"/><path fill="secondary" d="M59 69h55v12H59z"/>
    <path fill="#354c3a" d="M132 63h9v19h-9zm19 0h9v19h-9z"/>
    <path fill="none" d="M61 89l-10 14m36-4v14M30 65h18m125 5h13m-75-15h9"/>
    <path fill="none" stroke="#d2df9b" d="M73 53c8-6 16-5 21-2"/>
  `],
  carver: ['#984d46', '#b6b7ac', `
    <path fill="primary" d="M18 74l14-17h42l17 12v28l-17 10-43-7-17-12z"/>
    <path fill="secondary" d="M80 69h92l10 8-11 18H80z"/>
    <path fill="none" stroke="#677270" stroke-width="6" stroke-dasharray="2 7" d="M84 68h87l12 9-12 19H84"/>
    <path fill="none" d="M89 80h78m-48-6-8 14m30-14-9 14M42 57l9-12h27l-1 18m-11 39-2 13"/>
    <circle cx="58" cy="84" r="18" fill="#6d6862"/><circle cx="58" cy="84" r="8" fill="secondary"/>
    <path fill="secondary" d="M23 78h10v13H23z"/>
  `],
  shocklance: ['#bc9445', '#91b9d1', `
    <path fill="primary" d="M16 53l19 13v17L16 97zM36 62h87v19H36z"/>
    <path fill="primary" d="M91 51h66v7H91zm26 11 67 8-67 5zm-19 20h45v7H98z"/>
    <circle cx="54" cy="71" r="13" fill="#616f69"/><circle cx="54" cy="71" r="6" fill="secondary"/>
    <path fill="secondary" d="M70 54h18v8H70zm21 13h24v9H91zm-10 18 14 9-7 12-16-9z"/>
    <path fill="none" d="M105 90l-9 18m26-21-13 17M31 61v26"/>
  `],
  accelerator: ['#75a0b7', '#d6e2e3', `
    <path fill="primary" d="M23 47h18l11 22-10 23H21l12-23zM51 60h81v25H51zM130 65h49v15h-49z"/>
    <path fill="secondary" d="M53 84l21 23 45-18-11-6-32 15-14-14z"/>
    <path fill="primary" d="M92 81h22l-9 23H86z"/>
    <path fill="secondary" d="M74 49h10v13H74zm17 0h10v13H91zm17 0h10v13h-10z"/>
    <path fill="none" d="M61 68h65m12 6h32m-76 14-4 10m10-10-4 11"/>
  `],
  'diffraction-driver': ['#cd843b', '#6b8aab', `
    <path fill="#515856" d="M16 77l36 6 5 19-41-8z"/>
    <path fill="primary" d="M52 68l17-15h57l21 15v29H52z"/>
    <path fill="#514d49" d="M141 66l40 4 3 23h-44z"/>
    <path fill="secondary" d="M83 68h49v18H83zm61 11h34v10h-34z"/>
    <path fill="primary" d="M72 55l-5-24 7 1 9 23z"/>
    <path fill="#e3c367" d="M18 86l30 6v6l-30-6z" stroke="none"/>
    <path fill="none" d="M63 72v20m12-29v30m69-29 34-6M91 98l-5 12h-16l4-13"/>
  `],
  'incendiary-grenade': ['#dc7642', '#f3bd62', `
    <path fill="primary" d="M100 17c-18 26-34 31-28 57l-20-18c0 39-10 53 17 68 18 10 48 8 63-8 22-23 7-45-6-58l1 24-17-25c-8-12-13-20-10-40z"/>
    <path fill="secondary" d="M97 72c-4 18-25 26-17 41 5 12 27 14 33 2 8-17-11-25-16-43z" stroke="none"/>
  `],
  'shock-grenade': ['#4c93bc', '#c3e8ee', `
    <path fill="primary" d="M108 16L62 74h30l-9 51 56-68h-34z"/>
    <path fill="none" stroke="secondary" stroke-width="5" d="M111 36L83 67h25l-12 34"/>
    <path fill="none" d="M55 34l-11 8 7 11m91 42 12-7-5-12M59 103l-12 10m94-77 11-12"/>
  `],
  'acid-grenade': ['#80ad3e', '#c9e487', `
    <path fill="primary" d="M69 26l17 3 5 25 19 10 8-10 1-25 13-8 9 9-8 23 18 13 15-4 5 12-17 9 1 17-15 12-8-12-16 5-8 25-18-2 4-20-20-9-13 11-20-6 5-15 18 1 7-16-13-20z"/>
    <path fill="secondary" d="M91 76l16-8 16 10-1 18-18 7-17-12z"/>
    <path fill="none" d="M55 35l-8-13m107 20 14-9M48 74l-20-3m33 48-8 11"/>
  `],
  'photon-disc': ['#ad9c52', '#f3e5a8', `
    <g transform="rotate(-27 100 73)"><ellipse cx="100" cy="73" rx="68" ry="29" fill="primary"/>
    <ellipse cx="100" cy="68" rx="62" ry="25" fill="secondary"/><ellipse cx="100" cy="66" rx="32" ry="13" fill="#fffdf1"/>
    <path fill="none" d="M45 84c28 16 86 14 111-3"/></g>
    <path fill="none" stroke="primary" stroke-width="4" d="M31 51c10-21 34-31 56-30m32 99c24-1 45-17 51-35"/>
  `],
  'snowball-grenade': ['#7c9fc5', '#d1e8f3', `
    <path fill="none" stroke="primary" stroke-width="9" d="M100 24v94M59 47l82 48M59 95l82-48"/>
    <path fill="none" stroke="primary" stroke-width="5" d="M84 32l16 14 16-14m-32 78 16-14 16 14M56 65l20-5-3-20m54 64-3-20 20-5M73 103l3-20-20-5m88-15-20-5 3-20"/>
    <path fill="secondary" d="M100 57l13 14-13 15-13-15z"/>
  `],
  'g6-street-sweeper': ['#b8ad83', '#e5dcb8', `
    <path fill="#555952" d="M17 60h35v23H26l-9 10z"/>
    <path fill="primary" d="M49 52h112l18 9v28H49z"/>
    <path fill="secondary" d="M90 48h75v43H90z"/>
    <path fill="none" d="M100 56v28m13-28v28m13-28v28m13-28v28m13-28v28M54 58h24m-24 9h24"/>
    <path fill="primary" d="M60 88h15l-9 18H52zm63 3h12l-10 26h-12z"/>
    <path d="M119 99l11 4m-14 3 11 5"/>
  `],
  'a16-beam-ripper': ['#5e8198', '#a9cbd3', `
    <path fill="#364e65" d="M18 58l17-8h31v40H35L18 79z"/>
    <path fill="primary" d="M62 53h97l21 12v14l-21 14H62z"/>
    <path fill="#344c5b" d="M69 64h101v16H69z"/>
    <path fill="none" stroke="secondary" stroke-width="4" d="M75 49v47m17-47v47m17-47v47m17-47v47m17-47v47m16-44v43M64 59h102M64 85h102"/>
    <path fill="none" d="M164 48l15 11m-16 38 16-12M29 64h27m-27 9h27"/>
  `],
  'laser-cannon': ['#b29c49', '#e6d48c', `
    <path fill="primary" d="M44 55h117l14 12v19l-15 9H44z"/>
    <path fill="secondary" d="M65 62h87v24H65z"/>
    <ellipse cx="47" cy="74" rx="23" ry="27" fill="#b4b9b0"/><ellipse cx="45" cy="74" rx="12" ry="18" fill="#62716a"/>
    <path fill="none" stroke="#f8f4d7" stroke-width="5" d="M79 73h61"/>
    <path fill="none" d="M74 53v38m70-38v38m13-36v34m-90 7-9 12m73-12 9 12"/>
  `],
  'last-argument': ['#8b8e77', '#d2c65b', `
    <path fill="primary" d="M23 50h134l24 18v16l-24 18H23z"/>
    <path fill="#475552" d="M35 61h116v28H35z"/>
    <path fill="secondary" d="M60 66h62v18H60zM135 63l26 5 13 8-13 9-26 3z"/>
    <path fill="none" stroke="#a7b1ac" stroke-width="5" d="M20 48h141M20 104h141M35 49v54m44-54v54m50-54v54m34-47v39"/>
    <path fill="none" d="M16 56l12 19-12 22m143-39 21 16-21 20M50 45h55"/>
  `],
};

export function equipmentArt(ownerId) {
  const portrait = Object.hasOwn(portraits, ownerId) && portraits[ownerId];
  if (!portrait) return '';
  const [primary, secondary, geometry] = portrait;
  const drawing = geometry.replaceAll('="primary"', `="${primary}"`).replaceAll('="secondary"', `="${secondary}"`);
  return `<svg class="equipment-art" data-equipment-art="${ownerId}" viewBox="0 0 200 140" fill="#e4e8e2" stroke="#30434a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawing}</svg>`;
}
