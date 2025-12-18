const fs = require('fs');
const path = require('path');
const bestzip = require('bestzip');
const cpx = require('cpx');
const rimraf = require('rimraf');

// Read manifest.json to get version and name
const manifestPath = path.join(__dirname, 'extension', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;
const extensionName = manifest.name
  .replace(/[^a-zA-Z0-9]/g, '-')
  .toLowerCase()
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

// Create dist folder
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  rimraf.sync(distPath);
}
fs.mkdirSync(distPath, { recursive: true });

console.log(`📦 Building extension: ${manifest.name} v${version}`);
console.log(`📁 Creating dist folder...`);

// Copy extension files to dist, excluding unwanted files
const extensionPath = path.join(__dirname, 'extension');
const excludePatterns = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.log',
  '**/*.md',
  '**/src/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/.gitignore',
  '**/.gitkeep'
];

// Copy files using cpx with exclusion patterns
const copyOptions = {
  exclude: excludePatterns,
  update: true,
  preserve: true
};

console.log(`📋 Copying extension files...`);
cpx.copySync(`${extensionPath}/**/*`, distPath, copyOptions);

// Remove any hidden files that might have been copied
const removeHiddenFiles = (dir) => {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      removeHiddenFiles(filePath);
    } else if (file.startsWith('.') && file !== '.gitkeep') {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Removed hidden file: ${filePath}`);
    }
  });
};

removeHiddenFiles(distPath);

// Create zip file
const zipFileName = `${extensionName}-${version}.zip`;
const zipPath = path.join(__dirname, zipFileName);

console.log(`📦 Creating zip file: ${zipFileName}...`);

// Get all files in dist folder recursively
const getAllFiles = (dir, fileList = []) => {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
};

const filesToZip = getAllFiles(distPath).map(file => 
  path.relative(distPath, file)
);

bestzip({
  source: filesToZip,
  destination: zipPath,
  cwd: distPath
}).then(() => {
  const fileSize = (fs.statSync(zipPath).size / 1024).toFixed(2);
  console.log(`✅ Build complete!`);
  console.log(`📦 Extension package: ${zipFileName} (${fileSize} KB)`);
  console.log(`📁 Location: ${path.resolve(zipPath)}`);
}).catch(err => {
  console.error(`❌ Error creating zip:`, err);
  process.exit(1);
});

