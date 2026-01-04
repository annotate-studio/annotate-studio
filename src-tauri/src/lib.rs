use base64::{engine::general_purpose::STANDARD, Engine};
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    current_pdf_path: Mutex<Option<PathBuf>>,
    pdf_page_count: Mutex<usize>,
}

#[derive(Serialize, Deserialize, Clone)]
struct PdfPageInfo {
    page_number: usize,
    width: f32,
    height: f32,
    image_data: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct PdfPageMeta {
    page_number: usize,
    width: f32,
    height: f32,
}

#[derive(Serialize, Deserialize, Clone)]
struct PdfOpenedEvent {
    path: String,
    page_count: usize,
    pages_meta: Vec<PdfPageMeta>,
}

fn get_pdfium() -> Result<Pdfium, String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get exe path: {}", e))?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
    
    let lib_path = Pdfium::pdfium_platform_library_name_at_path(exe_dir);
    
    let bindings = Pdfium::bind_to_library(&lib_path)
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("Failed to bind Pdfium: {}", e))?;
    
    Ok(Pdfium::new(bindings))
}

#[tauri::command]
async fn open_pdf(path: String, state: State<'_, AppState>) -> Result<PdfOpenedEvent, String> {
    let pdf_path = PathBuf::from(&path);

    if !pdf_path.exists() {
        return Err("File not found".to_string());
    }

    let pdfium = get_pdfium()?;
    
    let document = pdfium
        .load_pdf_from_file(&pdf_path, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let page_count = document.pages().len() as usize;
    
    let mut pages_meta: Vec<PdfPageMeta> = Vec::new();
    
    for index in 0..page_count {
        let page = document.pages().get(index as u16).map_err(|e| format!("Failed to get page {}: {}", index + 1, e))?;
        pages_meta.push(PdfPageMeta {
            page_number: index + 1,
            width: page.width().value,
            height: page.height().value,
        });
    }
    
    *state.current_pdf_path.lock().unwrap() = Some(pdf_path);
    *state.pdf_page_count.lock().unwrap() = page_count;

    Ok(PdfOpenedEvent {
        path,
        page_count,
        pages_meta,
    })
}

#[tauri::command]
async fn render_pdf_page(path: String, page_number: usize, width: Option<i32>) -> Result<PdfPageInfo, String> {
    let pdf_path = PathBuf::from(&path);

    let pdfium = get_pdfium()?;
    
    let document = pdfium
        .load_pdf_from_file(&pdf_path, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let page_index: u16 = (page_number - 1).try_into().map_err(|_| "Invalid page number")?;
    
    let page = document
        .pages()
        .get(page_index)
        .map_err(|_| format!("Page {} not found", page_number))?;

    let page_width = page.width().value;
    let page_height = page.height().value;

    let target_width = width.unwrap_or(1600);

    let render_config = PdfRenderConfig::new()
        .set_target_width(target_width)
        .set_maximum_height((target_width as f32 * page_height / page_width) as i32 + 100);

    let image = page
        .render_with_config(&render_config)
        .map_err(|e| format!("Failed to render page: {}", e))?
        .as_image();

    let mut jpeg_data: Vec<u8> = Vec::new();
    image
        .write_to(
            &mut std::io::Cursor::new(&mut jpeg_data),
            image::ImageFormat::Jpeg,
        )
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    let base64_image = STANDARD.encode(&jpeg_data);

    Ok(PdfPageInfo {
        page_number,
        width: page_width,
        height: page_height,
        image_data: format!("data:image/jpeg;base64,{}", base64_image),
    })
}

#[tauri::command]
fn get_pdf_info(state: State<'_, AppState>) -> Result<(Option<String>, usize), String> {
    let path = state.current_pdf_path.lock().unwrap();
    let count = *state.pdf_page_count.lock().unwrap();

    Ok((
        path.as_ref().map(|p| p.to_string_lossy().to_string()),
        count,
    ))
}

#[derive(Serialize, Deserialize)]
struct ProjectData {
    version: String,
    pdf_path: Option<String>,
    strokes: String,
}

#[tauri::command]
async fn save_project(path: String, pdf_path: Option<String>, strokes_json: String) -> Result<(), String> {
    let project = ProjectData {
        version: "1.0.0".to_string(),
        pdf_path,
        strokes: strokes_json,
    };
    
    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;
    
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_project(path: String) -> Result<ProjectData, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let project: ProjectData = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse project: {}", e))?;
    
    Ok(project)
}

#[tauri::command]
async fn export_canvas(path: String, image_data: String) -> Result<(), String> {
    let base64_data = image_data
        .strip_prefix("data:image/png;base64,")
        .or_else(|| image_data.strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(&image_data);
    
    let decoded = STANDARD.decode(base64_data)
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    
    std::fs::write(&path, decoded)
        .map_err(|e| format!("Failed to write image: {}", e))?;
    
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct ExportPdfPage {
    image_data: String,
    width: f32,
    height: f32,
}

#[tauri::command]
async fn export_to_pdf(path: String, pages: Vec<ExportPdfPage>) -> Result<(), String> {
    use printpdf::{PdfDocument, Mm, Px, Image, ImageXObject, ColorSpace, ColorBits, ImageTransform};
    use ::image::ImageReader;
    
    if pages.is_empty() {
        return Err("No pages to export".to_string());
    }
    
    let first_page = &pages[0];
    let page_width_mm = Mm(first_page.width * 0.264583);
    let page_height_mm = Mm(first_page.height * 0.264583);
    
    let (doc, page1, layer1) = PdfDocument::new(
        "Annotate Studio Export",
        page_width_mm,
        page_height_mm,
        "Layer 1"
    );
    
    for (i, page_data) in pages.iter().enumerate() {
        let pw_mm = page_data.width * 0.264583;
        let ph_mm = page_data.height * 0.264583;
        
        let (current_page, current_layer) = if i == 0 {
            (page1, layer1)
        } else {
            let (page, layer) = doc.add_page(
                Mm(pw_mm),
                Mm(ph_mm),
                "Layer 1"
            );
            (page, layer)
        };
        
        let base64_data = page_data.image_data
            .strip_prefix("data:image/png;base64,")
            .or_else(|| page_data.image_data.strip_prefix("data:image/jpeg;base64,"))
            .unwrap_or(&page_data.image_data);
        
        let decoded = STANDARD.decode(base64_data)
            .map_err(|e| format!("Failed to decode image: {}", e))?;
        
        let img = ImageReader::new(std::io::Cursor::new(&decoded))
            .with_guessed_format()
            .map_err(|e| format!("Failed to guess image format: {}", e))?
            .decode()
            .map_err(|e| format!("Failed to decode image: {}", e))?;
        
        let img_rgb = img.to_rgb8();
        let (img_width, img_height) = (img_rgb.width(), img_rgb.height());
        
        let image = Image::from(ImageXObject {
            width: Px(img_width as usize),
            height: Px(img_height as usize),
            color_space: ColorSpace::Rgb,
            bits_per_component: ColorBits::Bit8,
            interpolate: true,
            image_data: img_rgb.into_raw(),
            image_filter: None,
            clipping_bbox: None,
            smask: None,
        });
        
        let dpi = 72.0;
        let img_width_mm = (img_width as f32 / dpi) * 25.4;
        let img_height_mm = (img_height as f32 / dpi) * 25.4;
        
        let scale_x = pw_mm / img_width_mm;
        let scale_y = ph_mm / img_height_mm;
        
        let layer = doc.get_page(current_page).get_layer(current_layer);
        image.add_to_layer(
            layer,
            ImageTransform {
                translate_x: Some(Mm(0.0)),
                translate_y: Some(Mm(0.0)),
                scale_x: Some(scale_x),
                scale_y: Some(scale_y),
                ..Default::default()
            }
        );
    }
    
    let pdf_bytes = doc.save_to_bytes()
        .map_err(|e| format!("Failed to save PDF: {}", e))?;
    
    std::fs::write(&path, pdf_bytes)
        .map_err(|e| format!("Failed to write PDF file: {}", e))?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
    
    if cfg!(target_os = "windows") {
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--enable-gpu-rasterization --enable-zero-copy --enable-features=Vulkan,UseSkiaRenderer --disable-features=UseChromeOSDirectVideoDecoder --force-gpu-mem-available-mb=1024");
    }

    tauri::Builder::default()
        .manage(AppState {
            current_pdf_path: Mutex::new(None),
            pdf_page_count: Mutex::new(0),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            open_pdf,
            render_pdf_page,
            get_pdf_info,
            save_project,
            load_project,
            export_canvas,
            export_to_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
