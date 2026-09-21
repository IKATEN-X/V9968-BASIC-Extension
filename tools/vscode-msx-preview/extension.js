'use strict';

const vscode = require('vscode');
const path = require('path');
const { decode, DEFAULT_PALETTE, parseCsvPalette } = require('./decoder');

class MsxImageDocument {
  constructor(uri) {
    this.uri = uri;
  }
  dispose() {}
}

class MsxImagePreviewProvider {
  constructor() {
    this.palettes = new Map();
  }

  openCustomDocument(uri) {
    return new MsxImageDocument(uri);
  }

  async resolveCustomEditor(document, panel) {
    panel.webview.options = { enableScripts: true };
    const update = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        const extension = path.extname(document.uri.fsPath);
        const palette = this.palettes.get(document.uri.toString()) || DEFAULT_PALETTE;
        const image = decode(bytes, extension, palette);
        panel.webview.html = renderHtml(panel.webview, document.uri, image);
      } catch (error) {
        panel.webview.html = renderError(panel.webview, document.uri, error);
      }
    };

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.dirname(document.uri.fsPath), path.basename(document.uri.fsPath))
    );
    watcher.onDidChange(update);
    watcher.onDidCreate(update);
    panel.onDidDispose(() => watcher.dispose());
    panel.webview.onDidReceiveMessage(async message => {
      if (message.type === 'choosePalette') {
        const picked = await vscode.window.showOpenDialog({
          title: 'Select a CSV palette (index, red, green, blue)',
          canSelectMany: false,
          filters: { 'CSV palette': ['pal', 'csv', 'dat', 'txt'] }
        });
        if (!picked?.length) return;
        try {
          const paletteBytes = await vscode.workspace.fs.readFile(picked[0]);
          this.palettes.set(document.uri.toString(), parseCsvPalette(Buffer.from(paletteBytes).toString('utf8')));
          await update();
        } catch (error) {
          void vscode.window.showErrorMessage(`MSX palette: ${error.message}`);
        }
      } else if (message.type === 'resetPalette') {
        this.palettes.delete(document.uri.toString());
        await update();
      }
    });
    await update();
  }
}

function nonce() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 24 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function baseStyles() {
  return `
    html, body { height: 100%; }
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    .toolbar { box-sizing: border-box; height: 42px; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
    button, select { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 5px 9px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .info { margin-left: auto; color: var(--vscode-descriptionForeground); }
    .stage { height: calc(100% - 43px); display: grid; place-items: center; overflow: auto; background-color: #202020; background-image: linear-gradient(45deg,#282828 25%,transparent 25%),linear-gradient(-45deg,#282828 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#282828 75%),linear-gradient(-45deg,transparent 75%,#282828 75%); background-size: 20px 20px; background-position: 0 0,0 10px,10px -10px,-10px 0; }
    canvas { image-rendering: pixelated; image-rendering: crisp-edges; box-shadow: 0 3px 20px #000a; }
  `;
}

function renderHtml(webview, uri, image) {
  const token = nonce();
  const pixels = image.rgba.toString('base64');
  const headerText = image.header ? `BSAVE, start &H${image.start.toString(16).toUpperCase().padStart(4, '0')}` : 'raw VRAM';
  return `<!doctype html>
  <html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${token}'; script-src 'nonce-${token}';"><style nonce="${token}">${baseStyles()}</style></head>
  <body>
    <div class="toolbar">
      <label>Zoom <select id="zoom"><option value="fit">Fit</option><option value="1">1x</option><option value="2" selected>2x</option><option value="3">3x</option><option value="4">4x</option></select></label>
      <button id="palette">Palette…</button><button id="reset">Default palette</button>
      <span class="info">${escapeHtml(path.basename(uri.fsPath))} — ${image.width}×${image.height}, ${image.byteLength} bytes, ${headerText}</span>
    </div>
    <div class="stage" id="stage"><canvas id="image" width="${image.width}" height="${image.height}"></canvas></div>
    <script nonce="${token}">
      const vscode = acquireVsCodeApi();
      const width=${image.width}, height=${image.height};
      const canvas=document.getElementById('image'), stage=document.getElementById('stage'), zoom=document.getElementById('zoom');
      const raw=atob('${pixels}'), data=new Uint8ClampedArray(raw.length);
      for(let i=0;i<raw.length;i++) data[i]=raw.charCodeAt(i);
      canvas.getContext('2d').putImageData(new ImageData(data,width,height),0,0);
      function resize(){
        let scale=Number(zoom.value);
        if(zoom.value==='fit') scale=Math.min((stage.clientWidth-24)/width,(stage.clientHeight-24)/height);
        canvas.style.width=Math.max(1,Math.floor(width*scale))+'px'; canvas.style.height=Math.max(1,Math.floor(height*scale))+'px';
      }
      zoom.addEventListener('change',resize); addEventListener('resize',resize); resize();
      document.getElementById('palette').addEventListener('click',()=>vscode.postMessage({type:'choosePalette'}));
      document.getElementById('reset').addEventListener('click',()=>vscode.postMessage({type:'resetPalette'}));
    </script>
  </body></html>`;
}

function renderError(webview, uri, error) {
  const token = nonce();
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${token}';"><style nonce="${token}">${baseStyles()}.error{padding:24px;color:var(--vscode-errorForeground)}</style></head><body><div class="error"><h2>${escapeHtml(path.basename(uri.fsPath))}</h2><p>${escapeHtml(error.message || error)}</p></div></body></html>`;
}

function activate(context) {
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(
    'msxImage.preview', new MsxImagePreviewProvider(), { supportsMultipleEditorsPerDocument: true }
  ));
  context.subscriptions.push(vscode.commands.registerCommand('msxImage.openPreview', async resource => {
    const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri = resource instanceof vscode.Uri ? resource : activeInput?.uri;
    if (!uri) {
      void vscode.window.showErrorMessage('Open an SC2 or SC5 file before running MSX Image: Open MSX Image Preview.');
      return;
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, 'msxImage.preview');
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
