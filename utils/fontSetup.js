const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function initFontconfig() {
  const projectFontsDir = path.resolve(__dirname, '..', 'public', 'fonts');
  const confDir = path.resolve(__dirname, '..', 'config', 'fonts');
  if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });

  const fontsConfFile = path.join(confDir, 'fonts.conf');
  const fontFile = path.join(projectFontsDir, 'NotoSansBengali.ttf');

  // Directory candidates where Linux fontconfig looks
  const candidateDirs = [projectFontsDir];

  // Attempt user home font directories (especially on Hostinger / Linux VPS)
  try {
    const userHome = os.homedir();
    const dotFonts = path.join(userHome, '.fonts');
    const localShareFonts = path.join(userHome, '.local', 'share', 'fonts');

    [dotFonts, localShareFonts].forEach(dir => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, 'NotoSansBengali.ttf');
        if (fs.existsSync(fontFile) && !fs.existsSync(target)) {
          fs.copyFileSync(fontFile, target);
        }
        candidateDirs.push(dir);
      } catch (e) {}
    });
  } catch (e) {}

  // Attempt /tmp/fonts
  if (process.platform === 'linux') {
    try {
      const tmpFonts = '/tmp/fonts';
      if (!fs.existsSync(tmpFonts)) fs.mkdirSync(tmpFonts, { recursive: true });
      const tmpTarget = path.join(tmpFonts, 'NotoSansBengali.ttf');
      if (fs.existsSync(fontFile) && !fs.existsSync(tmpTarget)) {
        fs.copyFileSync(fontFile, tmpTarget);
      }
      candidateDirs.push(tmpFonts);
    } catch (e) {}
  }

  // Create clean fonts.conf
  const dirTags = candidateDirs.map(d => `  <dir>${d.replace(/\\/g, '/')}</dir>`).join('\n');
  const xml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
${dirTags}
  <dir>~/.fonts</dir>
  <dir>~/.local/share/fonts</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  
  <cachedir>/tmp/fontconfig-cache</cachedir>
  <cachedir>~/.cache/fontconfig</cachedir>

  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>

  <alias>
    <family>sans-serif</family>
    <prefer>
      <family>Noto Sans Bengali</family>
    </prefer>
  </alias>

  <alias>
    <family>serif</family>
    <prefer>
      <family>Noto Sans Bengali</family>
    </prefer>
  </alias>

  <match target="pattern">
    <test qual="any" name="family">
      <string>Noto Sans Bengali</string>
    </test>
    <edit name="family" mode="assign" binding="same">
      <string>Noto Sans Bengali</string>
    </edit>
  </match>

  <match target="pattern">
    <test qual="any" name="family">
      <string>sans-serif</string>
    </test>
    <edit name="family" mode="prepend" binding="strong">
      <string>Noto Sans Bengali</string>
    </edit>
  </match>
</fontconfig>`;

  try {
    fs.writeFileSync(fontsConfFile, xml, 'utf8');
  } catch (e) {
    console.warn('Could not write fonts.conf:', e.message);
  }

  process.env.FONTCONFIG_PATH = confDir;
  process.env.FONTCONFIG_FILE = fontsConfFile;

  // Run fc-cache silently if available on Linux
  if (process.platform === 'linux') {
    try {
      execSync(`fc-cache -f "${projectFontsDir}"`, { stdio: 'ignore' });
    } catch (e) {}
  }

  return { fontsConfFile, confDir, candidateDirs };
}

module.exports = initFontconfig;

// Execute immediately when required
initFontconfig();
