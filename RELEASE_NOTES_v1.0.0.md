# Annotate Studio v1.0.0

🎉 **First stable release of Annotate Studio!**

A high-performance PDF annotation tool built with WebGL rendering, spatial indexing, and native desktop integration.

## 🚀 What's New

- **WebGL Rendering Engine** - Hardware-accelerated drawing with 60+ FPS
- **Spatial Indexing** - QuadTree-based hit detection for instant selection
- **Professional Tools** - Pen, highlighter, eraser, shapes, and text
- **Multi-Platform Support** - Native apps for Windows, macOS, and Linux
- **Export Workflows** - Save as PDF with annotations or project files
- **Real-time Performance** - Buffer caching and dirty flags for smooth editing

## 📦 Installation

Choose the appropriate installer for your platform:

### Windows

**Recommended:**
- `Annotate-Studio_1.0.0_x64-setup.exe` - NSIS Installer (easier installation)

**Alternative:**
- `Annotate-Studio_1.0.0_x64_en-US.msi` - MSI Installer (for enterprise deployment)

**Installation:**
1. Download the installer
2. Run the `.exe` or `.msi` file
3. Follow the installation wizard
4. Launch from Start Menu

---

### macOS

**Apple Silicon (M1/M2/M3):**
- `Annotate-Studio_1.0.0_aarch64.dmg`

**Intel Macs:**
- `Annotate-Studio_1.0.0_x64.dmg`

**Installation:**
1. Download the appropriate `.dmg` file for your Mac
2. Open the `.dmg` file
3. Drag Annotate Studio to Applications folder
4. Launch from Applications

---

### Linux

**Debian/Ubuntu:**
- `annotate-studio_1.0.0_amd64.deb`

```bash
sudo dpkg -i annotate-studio_1.0.0_amd64.deb
```

**Fedora/RHEL/CentOS:**
- `annotate-studio-1.0.0-1.x86_64.rpm`

```bash
sudo rpm -i annotate-studio-1.0.0-1.x86_64.rpm
```

**Universal (All Distributions):**
- `annotate-studio_1.0.0_amd64.AppImage`

```bash
chmod +x annotate-studio_1.0.0_amd64.AppImage
./annotate-studio_1.0.0_amd64.AppImage
```

---

## ⚡ Performance

- **60+ FPS** rendering with WebGL
- **5-10x faster** than Canvas 2D rendering
- **100x faster** hit detection with spatial indexing
- **Instant selection** even with thousands of strokes

## 🎨 Features

- **Drawing Tools:** Pen, highlighter, eraser with pressure sensitivity
- **Shapes:** Rectangle, circle, line, arrow with fill support
- **Text:** Add text and mathematical symbols
- **Selection:** Multi-select, move, resize, and delete
- **Undo/Redo:** Full history support
- **Zoom/Pan:** Smooth navigation with mouse and trackpad
- **Dark Mode:** Beautiful dark theme support
- **Export:** Save as PDF or project files (.asp)

## 🔧 System Requirements

### Minimum
- **OS:** Windows 10, macOS 10.13, Ubuntu 20.04
- **RAM:** 4 GB
- **GPU:** Any GPU with WebGL support

### Recommended
- **OS:** Windows 11, macOS 12+, Ubuntu 22.04
- **RAM:** 8 GB
- **GPU:** Dedicated GPU for better performance

## 📝 Known Issues

- Large PDFs (500+ pages) may take time to export
- Font rendering in exported PDFs uses system fonts

## 🙏 Credits

Developed by **CluvexStudio** & **ParsaDostifam**

Built with: Next.js, React, Tauri, Rust, WebGL, TypeScript

---

**Full Changelog:** https://github.com/annotate-studio/annotate-studio/commits/v1.0.0
