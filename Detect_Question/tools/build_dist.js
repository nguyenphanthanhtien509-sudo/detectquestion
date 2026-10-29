const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');

console.log('Bắt đầu quá trình Build & Obfuscate bảo vệ mã nguồn...');

// 1. Tạo thư mục dist sạch
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Cấu hình Obfuscator mạnh mẽ chống dịch ngược (Anti-Reversing, String Array Encryption, NO EVAL cho MV3 Service Worker)
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false, // Để dung lượng vừa phải và hiệu năng mượt
  debugProtection: false,   // Tránh làm crash môi trường content script
  disableConsoleOutput: false, // Không inject wrapper window.console làm lỗi Service Worker
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,     // Giữ global APIs Chrome
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  // RC4/Base64 string decoders inject runtime charAt() calls. In content
  // scripts those wrappers can receive an undefined decoder key after Chrome
  // isolates/reloads a frame, breaking a solve with “reading 'charAt'”. Keep
  // string-array obfuscation but emit direct strings instead of a fragile
  // runtime decoder.
  stringArrayEncoding: [],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  target: 'browser-no-eval' // Bắt buộc cho Chrome Extension MV3 và Service Worker
};

// 3. Hàm quét đệ quy tất cả các file JS trong thư mục
function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

// 4. Obfuscate tất cả các file JavaScript được quét tự động
const allJsFiles = getAllJsFiles(srcDir);
console.log(`Tìm thấy ${allJsFiles.length} file JavaScript trong src/ để mã hóa:`);

for (const fullSrcPath of allJsFiles) {
  const relPath = path.relative(rootDir, fullSrcPath).replace(/\\/g, '/');
  const destPath = path.join(distDir, relPath);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  console.log(`  [${relPath}]...`);
  const code = fs.readFileSync(fullSrcPath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
  fs.writeFileSync(destPath, obfuscated.getObfuscatedCode(), 'utf8');
}

// 5. Sao chép các file tài nguyên tĩnh (manifest.json, popup.html, popup.css, icons)
console.log('Sao chép tài nguyên tĩnh (manifest.json, popup.html, popup.css, icons)...');

fs.copyFileSync(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
// popup removed

const clipboardDestDir = path.join(distDir, 'src', 'background');
fs.mkdirSync(clipboardDestDir, { recursive: true });
fs.copyFileSync(path.join(rootDir, 'src', 'background', 'clipboard.html'), path.join(clipboardDestDir, 'clipboard.html'));

// icons removed

console.log('HOÀN THÀNH BUILD & MÃ HÓA!');
console.log(`Thư mục Extension thành phẩm: ${distDir}`);
