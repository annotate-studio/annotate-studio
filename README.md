# Annotate Studio

<div align="center">

![Annotate Studio](AnnotateStudio.png)

**High-performance PDF annotation engine built with WebGL rendering and spatial indexing**

[![Release](https://img.shields.io/github/v/release/annotate-studio/annotate-studio)](https://github.com/annotate-studio/annotate-studio/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://github.com/annotate-studio/annotate-studio/releases)

[Download](https://github.com/annotate-studio/annotate-studio/releases) • [Documentation](#features) • [Report Bug](https://github.com/annotate-studio/annotate-studio/issues)

</div>

---

## ✨ Features

### 🎨 Professional Drawing Tools
- **Pen & Highlighter** - Smooth, pressure-sensitive drawing with real-time rendering
- **Shapes** - Rectangle, circle, line, arrow with customizable colors and fills
- **Text & Symbols** - Add text annotations and mathematical symbols
- **Eraser** - Intelligent stroke segmentation for precise editing

### ⚡ Performance
- **WebGL Rendering** - Hardware-accelerated graphics with 60+ FPS
- **Spatial Indexing** - QuadTree-based hit detection for instant selection (100x faster)
- **Buffer Caching** - Smart memory management for smooth editing
- **Batch Processing** - Parallel rendering for multi-page exports

### 🛠️ Workflow
- **Multi-Page Support** - Navigate and annotate across all PDF pages
- **Undo/Redo** - Full history with unlimited steps
- **Selection Tools** - Multi-select, move, resize, and transform
- **Export Options** - Save as PDF or project files (.asp)
- **Auto-Save** - Never lose your work

### 🎯 User Experience
- **Dark Mode** - Beautiful dark theme for comfortable editing
- **Keyboard Shortcuts** - Fast navigation and tool switching
- **Zoom & Pan** - Smooth navigation with mouse and trackpad
- **Real-time Preview** - See changes instantly as you draw

---

## 📦 Installation

Download the latest release for your platform from [Releases](https://github.com/annotate-studio/annotate-studio/releases).

### Windows
- **NSIS Installer** (Recommended): `Annotate-Studio_x64-setup.exe`
- **MSI Installer**: `Annotate-Studio_x64_en-US.msi`

### macOS
- **Apple Silicon**: `Annotate-Studio_aarch64.dmg` (M1/M2/M3)
- **Intel**: `Annotate-Studio_x64.dmg`

### Linux
- **Debian/Ubuntu**: `annotate-studio_amd64.deb`
- **Fedora/RHEL**: `annotate-studio.x86_64.rpm`
- **AppImage**: `annotate-studio_amd64.AppImage` (Universal)

---

## 🚀 Quick Start

1. **Open PDF** - Drag & drop or use `Ctrl+O`
2. **Select Tool** - Choose from pen, highlighter, shapes, or text
3. **Annotate** - Draw, write, or add shapes to your PDF
4. **Save** - Export as PDF or save as project file

---

## ⌨️ Keyboard Shortcuts

| Tool | Shortcut | Action | Shortcut |
|------|----------|--------|----------|
| Select | `V` | Save | `Ctrl+S` |
| Pan | `H` | Save As | `Ctrl+Shift+S` |
| Pen | `P` | Undo | `Ctrl+Z` |
| Highlighter | `M` | Redo | `Ctrl+Y` |
| Eraser | `E` | Copy | `Ctrl+C` |
| Text | `T` | Paste | `Ctrl+V` |
| Rectangle | `R` | Delete | `Del` |
| Circle | `O` | Zoom In | `Ctrl++` |
| Line | `L` | Zoom Out | `Ctrl+-` |

---

## 🏗️ Tech Stack

**Frontend**
- Next.js 16 - React framework with Turbopack
- React 19 - UI library
- TypeScript - Type safety
- Zustand - State management

**Backend**
- Tauri 2.0 - Desktop framework
- Rust - Systems programming
- WebAssembly - High-performance modules

**Rendering**
- WebGL - Hardware-accelerated graphics
- Canvas 2D - Fallback rendering
- QuadTree - Spatial indexing

---

## 🛠️ Development

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Tauri CLI

### Setup

```bash
# Clone repository
git clone https://github.com/annotate-studio/annotate-studio.git
cd annotate-studio

# Install dependencies
cd src
npm install

# Build WASM modules
npm run build:wasm

# Run development server
cd ../src-tauri
cargo tauri dev
```

### Build

```bash
# Build for production
cd src-tauri
cargo tauri build
```

Output: `src-tauri/target/release/bundle/`

---

## 📊 Performance Benchmarks

| Metric | Canvas 2D | WebGL | Improvement |
|--------|-----------|-------|-------------|
| Rendering | 10-15 FPS | 60+ FPS | **5-10x faster** |
| Hit Detection | O(n) | O(log n) | **100x faster** |
| Memory Usage | High | Optimized | **50% reduction** |
| Stroke Limit | ~1000 | ~10000+ | **10x more** |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors

Developed by **CluvexStudio** & **ParsaDostifam**

---

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Desktop framework
- [Next.js](https://nextjs.org/) - React framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [pdfium-render](https://github.com/bblanchon/pdfium-binaries) - PDF rendering

---

<div align="center">

**[⬇️ Download](https://github.com/annotate-studio/annotate-studio/releases)** • **[🐛 Report Bug](https://github.com/annotate-studio/annotate-studio/issues)** • **[💡 Request Feature](https://github.com/annotate-studio/annotate-studio/issues)**

Made with ❤️ for the PDF annotation community

</div>
